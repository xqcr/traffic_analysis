from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import redis
import pandas as pd
import json
from datetime import datetime, timedelta
from io import StringIO
import numpy as np

app = FastAPI()
r = redis.Redis(host='localhost', port=6379, db=0)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

def read_redis_data(value):
    """Вспомогательная функция для чтения данных из Redis"""
    if value:
        try:
            json_str = value.decode('utf-8')
            df = pd.read_json(StringIO(json_str))
            # Convert Start1hPeriod to datetime if it's not already
            if 'Start1hPeriod' in df.columns:
                df['Start1hPeriod'] = pd.to_datetime(df['Start1hPeriod'])
            return df
        except Exception as e:
            print(f"Error reading Redis data: {e}")
            return None
    return None

def detect_anomalies(df, std_multiplier=3):
    """Обнаружение аномалий в трафике"""
    if df.empty:
        return pd.DataFrame()
        
    # статистика для каждого пользователя
    user_means = df.groupby('IdSubscriber').agg({
        'UpTx': 'mean',
        'DownTx': 'mean'
    })
    
    user_stds = df.groupby('IdSubscriber').agg({
        'UpTx': 'std',
        'DownTx': 'std'
    }).fillna(0) 
    
    df = df.merge(user_means, on='IdSubscriber', suffixes=('', '_mean'))
    df = df.merge(user_stds, on='IdSubscriber', suffixes=('', '_std'))
    
    # аномалии
    df['is_anomaly'] = (
        (df['UpTx'] > df['UpTx_mean'] + std_multiplier * df['UpTx_std']) |
        (df['DownTx'] > df['DownTx_mean'] + std_multiplier * df['DownTx_std'])
    )
    
    return df[df['is_anomaly']]

@app.get("/")
async def root():
    return {"message": "Telecom Traffic Analysis API"}

@app.get("/api/anomalies")
async def get_anomalies():
    """Получение списка аномалий"""
    try:
        all_data = []
        
        # получаем все данные из Redis
        for key in r.keys():
            df = read_redis_data(r.get(key))
            if df is not None:
                all_data.append(df)
        
        if not all_data:
            return []
        
        combined_df = pd.concat(all_data, ignore_index=True)
        
        # поиск аномалии
        anomalies = detect_anomalies(combined_df)
        
        return anomalies.to_dict(orient='records')
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/subscriber/{subscriber_id}")
async def get_subscriber_data(subscriber_id: int):
    """Получение данных конкретного абонента"""
    try:
        all_data = []
        
        for key in r.keys():
            df = read_redis_data(r.get(key))
            if df is not None:
                subscriber_data = df[df['IdSubscriber'] == subscriber_id]
                if not subscriber_data.empty:
                    all_data.append(subscriber_data)
        
        if not all_data:
            return []
        
        combined_df = pd.concat(all_data, ignore_index=True)
        return combined_df.to_dict(orient='records')
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/statistics")
async def get_statistics():
    """Получение общей статистики"""
    try:
        all_data = []
        
        for key in r.keys():
            df = read_redis_data(r.get(key))
            if df is not None:
                all_data.append(df)
        
        if not all_data:
            return {
                "total_subscribers": 0,
                "total_records": 0,
                "avg_upload": 0,
                "avg_download": 0,
                "anomalies_count": 0,
                "time_range": {
                    "start": None,
                    "end": None
                }
            }
        
        combined_df = pd.concat(all_data, ignore_index=True)
        
        anomalies_df = detect_anomalies(combined_df)
        
        combined_df['Start1hPeriod'] = pd.to_datetime(combined_df['Start1hPeriod'])
        
        start_time = combined_df['Start1hPeriod'].min()
        end_time = combined_df['Start1hPeriod'].max()
        
        stats = {
            "total_subscribers": int(combined_df['IdSubscriber'].nunique()),
            "total_records": len(combined_df),
            "avg_upload": float(combined_df['UpTx'].mean()),
            "avg_download": float(combined_df['DownTx'].mean()),
            "anomalies_count": len(anomalies_df),
            "time_range": {
                "start": start_time.strftime('%Y-%m-%d %H:%M:%S') if start_time is not None else None,
                "end": end_time.strftime('%Y-%m-%d %H:%M:%S') if end_time is not None else None
            }
        }
        
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
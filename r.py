import redis
import pandas as pd
import glob

# Подключение к БД
r = redis.Redis(host='localhost', port=6379, db=0)
pd.set_option('display.max_columns', None)

def getTimestampFileName(file):
    return (file.split(' ')[0].split('-')[0][-4:]+'-'+file.split(' ')[0].split('-')[1]+'-'+file.split(' ')[0].split('-')[2]\
              +' '+file.split(' ')[1].split(':')[0]+':'+file.split(' ')[1].split(':')[1]+':'+file.split(' ')[1].split(':')[2][:2])

# Функция для обработки файлов
def process_files(file_pattern):
    # Получаем список всех файлов по заданному шаблону
    files = glob.glob(file_pattern)
    files.sort()
    print(files)
    if not files:
        print("No files found.")
        return None
    dataframes = []
    hourdf = []
    startPeriod = ''
    j = 0
    for i in range(len(files)):
#    for i in range(20):
        file = files[i]
        if j == 0:
            startPeriod = pd.to_datetime(getTimestampFileName(file)) - pd.Timedelta(minutes=10)
            #print(startPeriod)
        # Определяем формат файла и загружаем данные
        try:
            if file.endswith('.csv'):
                df = pd.read_csv(file)
            elif file.endswith('.txt'):
                df = pd.read_csv(file, delimiter='|')
            else:
                continue

            # Преобразуем время в datetime и создаем нужные столбцы
            df['StartSession'] = pd.to_datetime(df['StartSession'], dayfirst=True)
            df['EndSession'] = pd.to_datetime(df['EndSession'], dayfirst=True)
            df['Start1hPeriod'] = startPeriod
            df['Start10mPeriod'] = startPeriod + pd.Timedelta(minutes=10*j)
            #df['SumTx'] = df['UpTx'] + df['DownTx']  # Общий трафик в байтах
            #df['DiffTx'] = df['UpTx'] - df['DownTx'] # Разница между выгрузкой и скачиванием

            # Очистка
            df = df.where(df['StartSession'] > pd.to_datetime("2023-12-25"))
            df = df.where((pd.Series(df['EndSession']).isna()))
            df = df.where(df['UpTx'] > 0)
            df = df.where(df['DownTx'] > 0)

            # Удаление лишних данных
            df = df.drop('IdSession', axis=1)
            #df = df.drop('IdPSX', axis=1)
            df = df.drop('StartSession', axis=1)
            df = df.drop('EndSession', axis=1)
            df = df.drop('Duartion', axis=1)

            df = df.dropna()
            #print(df.head(10))

            # Добавляем DataFrame в список
            hourdf.append(df)
            j += 1
            if j == 6 or len(files) - 1 == i:
                js = pd.concat(hourdf, ignore_index=True).to_json(orient='records')
                key_p1 = str(df.iloc[0]['Start1hPeriod'])
                key_p2 = int(df.iloc[0]['IdPSX'])
                print(f"{key_p2} {key_p1}")
                r.set(f"{key_p2} {key_p1}", js)
                #dataframes.append(pd.concat(hourdf, ignore_index=True))
                hourdf=[]
                j = 0

        except (TypeError, ValueError) as e:
            print(f"Error processing {file}: {e}")

    #return dataframes #массив df['IdSubscriber', 'Start1hPeriod', 'Start10mPeriod', 'UpTx', 'DownTx']

def load(df):
    js = df.to_json(orient='records')
    key = "Название таблицы"
    r.set(key, js)

if __name__ == "__main__":
    file_pattern = 'telecom10k/*'
    process_files(file_pattern)
    #load(df)
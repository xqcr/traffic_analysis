import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const Dashboard = () => {
  const [users, setUsers] = useState({ normal: [], anomalous: [] });
  const [selectedUsers, setSelectedUsers] = useState({ normal: null, anomalous: null });
  const [chartData, setChartData] = useState({ normal: [], anomalous: [] });
  const [loading, setLoading] = useState(true);

  const calculateMedian = (arr) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
      ? (sorted[middle - 1] + sorted[middle]) / 2 
      : sorted[middle];
  };

  const calculateMAD = (arr, median) => {
    const deviations = arr.map(x => Math.abs(x - median));
    return calculateMedian(deviations);
  };

  const calculateRobustZScore = (value, median, mad) => {
    return mad === 0 ? 0 : 0.6745 * (value - median) / mad;
  };

  const WINDOW_SIZE = 6;
  const Z_SCORE_THRESHOLD = 3.5;

  useEffect(() => {
    fetch('http://localhost:8000/api/anomalies')
      .then(response => response.json())
      .then(data => {
        const userTraffic = data.reduce((acc, item) => {
          if (!acc[item.IdSubscriber]) {
            acc[item.IdSubscriber] = [];
          }
          acc[item.IdSubscriber].push({
            time: new Date(item.Start10mPeriod),
            uploadGB: item.UpTx / (1024 * 1024 * 1024),
            downloadGB: item.DownTx / (1024 * 1024 * 1024),
          });
          return acc;
        }, {});

        const userStats = Object.entries(userTraffic).map(([userId, traffic]) => {
          const sorted = traffic.sort((a, b) => a.time - b.time);
          
          const windows = [];
          for (let i = 0; i <= sorted.length - WINDOW_SIZE; i++) {
            const window = sorted.slice(i, i + WINDOW_SIZE);
            const uploadValues = window.map(t => t.uploadGB);
            const downloadValues = window.map(t => t.downloadGB);

            const uploadMedian = calculateMedian(uploadValues);
            const downloadMedian = calculateMedian(downloadValues);
            const uploadMAD = calculateMAD(uploadValues, uploadMedian);
            const downloadMAD = calculateMAD(downloadValues, downloadMedian);

            const currentPoint = window[window.length - 1];
            const uploadZScore = calculateRobustZScore(currentPoint.uploadGB, uploadMedian, uploadMAD);
            const downloadZScore = calculateRobustZScore(currentPoint.downloadGB, downloadMedian, downloadMAD);

            windows.push({
              time: currentPoint.time,
              uploadGB: currentPoint.uploadGB,
              downloadGB: currentPoint.downloadGB,
              uploadZScore,
              downloadZScore,
              isAnomalous: Math.abs(uploadZScore) > Z_SCORE_THRESHOLD || 
                          Math.abs(downloadZScore) > Z_SCORE_THRESHOLD
            });
          }

          const hasAnomalies = windows.some(w => w.isAnomalous);
          const currentMedians = {
            upload: calculateMedian(windows.map(w => w.uploadGB)),
            download: calculateMedian(windows.map(w => w.downloadGB))
          };
          const maxZScore = Math.max(
            ...windows.map(w => Math.max(Math.abs(w.uploadZScore), Math.abs(w.downloadZScore)))
          );

          return {
            userId,
            traffic: windows,
            medianUpload: currentMedians.upload,
            medianDownload: currentMedians.download,
            maxZScore,
            isAnomalous: hasAnomalies,
            dataPoints: windows.length
          };
        });

        const validUsers = userStats.filter(user => user.dataPoints >= 6);
        const anomalousUsers = validUsers.filter(user => user.isAnomalous);
        const normalUsers = validUsers.filter(user => !user.isAnomalous);

        setUsers({
          normal: normalUsers.map(user => ({
            id: user.userId,
            medianUpload: user.medianUpload.toFixed(1),
            medianDownload: user.medianDownload.toFixed(1),
            maxZScore: user.maxZScore.toFixed(1),
            traffic: user.traffic
          })),
          anomalous: anomalousUsers.map(user => ({
            id: user.userId,
            medianUpload: user.medianUpload.toFixed(1),
            medianDownload: user.medianDownload.toFixed(1),
            maxZScore: user.maxZScore.toFixed(1),
            traffic: user.traffic
          }))
        });

        if (normalUsers.length && anomalousUsers.length) {
          setSelectedUsers({
            normal: normalUsers[0].userId,
            anomalous: anomalousUsers[0].userId
          });

          setChartData({
            normal: normalUsers[0].traffic.map(t => ({
              time: t.time.toLocaleTimeString(),
              upload: t.uploadGB,
              download: t.downloadGB,
              uploadZ: t.uploadZScore,
              downloadZ: t.downloadZScore
            })),
            anomalous: anomalousUsers[0].traffic.map(t => ({
              time: t.time.toLocaleTimeString(),
              upload: t.uploadGB,
              download: t.downloadGB,
              uploadZ: t.uploadZScore,
              downloadZ: t.downloadZScore
            }))
          });
        }

        setLoading(false);
      })
      .catch(error => {
        console.error('Error:', error);
        setLoading(false);
      });
  }, []);

  const handleUserChange = (type, userId) => {
    const selectedUser = users[type].find(u => u.id === userId);
    if (selectedUser) {
      setSelectedUsers(prev => ({ ...prev, [type]: userId }));
      setChartData(prev => ({
        ...prev,
        [type]: selectedUser.traffic.map(t => ({
          time: t.time.toLocaleTimeString(),
          upload: t.uploadGB,
          download: t.downloadGB,
          uploadZ: t.uploadZScore,
          downloadZ: t.downloadZScore
        }))
      }));
    }
  };

  const renderZScoreChart = (data, colors) => (
    <ResponsiveContainer>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="time" tick={{ fill: '#333' }} />
        <YAxis 
          domain={[-4, 4]} 
          ticks={[-3.5, -2, 0, 2, 3.5]}
          tick={{ fill: '#333' }}
          label={{ value: 'Z-score', angle: -90, position: 'insideLeft' }}
        />
        <Tooltip 
          contentStyle={{ backgroundColor: 'white', border: '1px solid #ccc' }}
          formatter={(value) => `${value.toFixed(2)}`}
        />
        <Legend />
        <Line type="monotone" dataKey="uploadZ" name="Z-score загрузки" stroke={colors.upload} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="downloadZ" name="Z-score скачивания" stroke={colors.download} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey={() => 3.5} stroke="#FF0000" strokeDasharray="3 3" dot={false} name="Порог аномалии" />
        <Line type="monotone" dataKey={() => -3.5} stroke="#FF0000" strokeDasharray="3 3" dot={false} />
        <Line type="monotone" dataKey={() => 2} stroke="#FFA500" strokeDasharray="3 3" dot={false} name="Порог подозрительности" />
        <Line type="monotone" dataKey={() => -2} stroke="#FFA500" strokeDasharray="3 3" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );

  if (loading) {
    return <div style={{ padding: '20px', color: '#333' }}>Загрузка данных...</div>;
  }

  return (
    <div style={{ 
      width: '1200px', 
      padding: '20px', 
      margin: '20px auto',
      background: 'white',
      borderRadius: '8px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    }}>
      <h2 style={{ 
        color: '#333', 
        marginBottom: '20px', 
        textAlign: 'center',
        fontSize: '2.5em',
        fontWeight: 'bold'
      }}>
        Анализ сетевого трафика
      </h2>

      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
        {/* Нормальный трафик */}
        <div style={{ flex: 1 }}>
          <h3 style={{ marginBottom: '10px', color: '#333' }}>Нормальный трафик</h3>
          <select 
            value={selectedUsers.normal} 
            onChange={(e) => handleUserChange('normal', e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ddd',
              marginBottom: '10px'
            }}
          >
            {users.normal.map(user => (
              <option key={user.id} value={user.id}>
                ID {user.id} (↑{user.medianUpload} ↓{user.medianDownload} GB/h, Z-max: {user.maxZScore})
              </option>
            ))}
          </select>

          {/* График трафика */}
          <div style={{ height: '300px', background: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
            <ResponsiveContainer>
              <LineChart data={chartData.normal}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fill: '#333' }} />
                <YAxis 
                  tick={{ fill: '#333' }}
                  label={{ value: 'Трафик (GB)', angle: -90, position: 'insideLeft' }}
                  domain={[0, 'auto']}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'white', border: '1px solid #ccc' }}
                  formatter={(value) => `${value.toFixed(2)} GB`}
                />
                <Legend />
                <Line type="monotone" dataKey="upload" name="Загрузка" stroke="#2196F3" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="download" name="Скачивание" stroke="#4CAF50" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* График Z-score */}
          <div style={{ height: '200px', background: '#f8f9fa', padding: '20px', borderRadius: '8px' }}>
            {renderZScoreChart(chartData.normal, { upload: '#90CAF9', download: '#A5D6A7' })}
          </div>
        </div>

        {/* Аномальный трафик */}
        <div style={{ flex: 1 }}>
          <h3 style={{ marginBottom: '10px', color: '#333' }}>Аномальный трафик</h3>
          <select 
            value={selectedUsers.anomalous} 
            onChange={(e) => handleUserChange('anomalous', e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ddd',
              marginBottom: '10px'
            }}
          >
            {users.anomalous.map(user => (
              <option key={user.id} value={user.id}>
                ID {user.id} (↑{user.medianUpload} ↓{user.medianDownload} GB/h, Z-max: {user.maxZScore})
              </option>
            ))}
          </select>

          {/* График трафика */}
          <div style={{ height: '300px', background: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
            <ResponsiveContainer>
              <LineChart data={chartData.anomalous}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fill: '#333' }} />
                <YAxis 
                  tick={{ fill: '#333' }}
                  label={{ value: 'Трафик (GB)', angle: -90, position: 'insideLeft' }}
                  domain={[0, 'auto']}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'white', border: '1px solid #ccc' }}
                  formatter={(value) => `${value.toFixed(2)} GB`}
                />
                <Legend />
                <Line type="monotone" dataKey="upload" name="Загрузка" stroke="#F44336" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="download" name="Скачивание" stroke="#FF9800" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* График Z-score */}
          <div style={{ height: '200px', background: '#f8f9fa', padding: '20px', borderRadius: '8px' }}>
            {renderZScoreChart(chartData.anomalous, { upload: '#FFCDD2', download: '#FFE0B2' })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
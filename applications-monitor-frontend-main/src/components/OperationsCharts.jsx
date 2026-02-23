import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';
import { 
  BarChart3, 
  TrendingUp, 
  Award, 
  Users, 
  Trophy,
  Medal,
  Target
} from 'lucide-react';
import { AnimatedCounter } from './AnimatedCounter';

// Priority 1: Top Performers Bar Chart
export function TopPerformersBarChart({ operations, operationsPerformance, notDownloadedMap = {}, loading = false }) {
  const chartData = useMemo(() => {
    return operations
      .map(op => ({
        name: op.name || op.email.split('@')[0],
        applications: operationsPerformance[op.email] || 0,
        notDownloaded: notDownloadedMap[op.email] || 0,
        email: op.email
      }))
      .sort((a, b) => b.applications - a.applications);
  }, [operations, operationsPerformance, notDownloadedMap]);

  const renderApplicationsLabel = ({ x, y, width, height, value, index }) => {
    const entry = chartData[index];
    const total = entry?.applications || 0;

    return (
      <text
        x={x + width + 10}
        y={y + height / 2}
        dominantBaseline="middle"
        textAnchor="start"
        fill="#0f172a"
        fontSize={12}
        fontWeight={600}
      >
        {total.toLocaleString()}
      </text>
    );
  };

  // Colorful palette - mix of different colors
  const COLORS = [
    '#10b981', // Green
    '#3b82f6', // Blue
    '#8b5cf6', // Purple
    '#f59e0b', // Amber
    '#ef4444', // Red
    '#06b6d4', // Cyan
    '#ec4899', // Pink
    '#84cc16', // Lime
    '#f97316', // Orange
    '#6366f1', // Indigo
    '#14b8a6', // Teal
    '#a855f7', // Violet
    '#eab308', // Yellow
    '#22c55e', // Green
    '#0ea5e9', // Sky
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">
        Top Performers
        {loading && (
          <span className="ml-2 inline-block w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
        )}
      </h3>
      {loading && chartData.length === 0 ? (
        <div className="flex items-center justify-center h-[300px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-slate-600">Loading performance data...</p>
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 40)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 80, left: 100, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis dataKey="name" type="category" width={120} />
            <Bar 
              dataKey="applications" 
              radius={[0, 8, 8, 0]}
              animationDuration={loading ? 0 : 1000}
              animationBegin={0}
            >
              {/* Always-visible values on bars (instead of hover tooltip) */}
              <LabelList dataKey="applications" content={renderApplicationsLabel} />
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// Priority 1: Monthly Leaderboard Widget
export function MonthlyLeaderboard({ operations, operationsPerformance, notDownloadedMap = {} }) {
  const topPerformers = useMemo(() => {
    return operations
      .map(op => ({
        name: op.name || op.email.split('@')[0],
        email: op.email,
        applications: operationsPerformance[op.email] || 0,
        notDownloaded: notDownloadedMap[op.email] || 0
      }))
      .sort((a, b) => b.applications - a.applications)
      .slice(0, 3);
  }, [operations, operationsPerformance, notDownloadedMap]);

  const totalApplications = useMemo(() => {
    return operations.reduce((sum, op) => sum + (operationsPerformance[op.email] || 0), 0);
  }, [operations, operationsPerformance]);

  const medals = [
    { position: 1, bgColor: 'bg-yellow-100', borderColor: 'border-yellow-400', textColor: 'text-yellow-800', iconColor: 'text-yellow-600' },
    { position: 2, bgColor: 'bg-gray-100', borderColor: 'border-gray-400', textColor: 'text-gray-800', iconColor: 'text-gray-600' },
    { position: 3, bgColor: 'bg-orange-100', borderColor: 'border-orange-400', textColor: 'text-orange-800', iconColor: 'text-orange-600' }
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Monthly Leaderboard</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {topPerformers.map((performer, index) => {
          const medal = medals[index];
          const percentage = totalApplications > 0
            ? ((performer.applications / totalApplications) * 100).toFixed(1)
            : '0.0';
          const dlRate = performer.applications > 0
            ? Math.round(((performer.applications - performer.notDownloaded) / performer.applications) * 100)
            : 100;

          return (
            <div
              key={performer.email}
              className={`${medal.bgColor} ${medal.borderColor} border-2 rounded-lg p-4 text-center`}
            >
              <div className="flex justify-center mb-2">
                {medal.position === 1 && <Trophy className={`w-10 h-10 ${medal.iconColor}`} />}
                {medal.position === 2 && <Medal className={`w-10 h-10 ${medal.iconColor}`} />}
                {medal.position === 3 && <Award className={`w-10 h-10 ${medal.iconColor}`} />}
              </div>
              <div className={`${medal.textColor} font-bold text-lg mb-1`}>{performer.name}</div>
              <div className={`${medal.textColor} text-2xl font-bold mb-1`}>{performer.applications}</div>
              <div className={`${medal.textColor} text-sm`}>Applications</div>
              <div className={`${medal.textColor} text-xs mt-1`}>{percentage}% of team total</div>
              <div className="mt-2 flex items-center justify-center gap-1.5">
                <div className="w-12 bg-white/50 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${dlRate >= 80 ? 'bg-green-500' : dlRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${dlRate}%` }}
                  />
                </div>
                <span className={`text-xs font-semibold ${dlRate >= 80 ? 'text-green-700' : dlRate >= 50 ? 'text-yellow-700' : 'text-red-700'}`}>
                  {dlRate}% done
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Priority 1: Team Performance Summary Cards
export function TeamPerformanceSummary({ operations, operationsPerformance, notDownloadedMap = {}, loading = false }) {
  const stats = useMemo(() => {
    const totalApplications = operations.reduce((sum, op) => sum + (operationsPerformance[op.email] || 0), 0);
    const avgApplications = operations.length > 0 ? (totalApplications / operations.length).toFixed(1) : 0;
    
    // Only consider performers with applications > 0
    const performersWithApplications = operations
      .map(op => ({
        name: op.name || op.email.split('@')[0],
        email: op.email,
        applications: operationsPerformance[op.email] || 0,
        notDownloaded: notDownloadedMap[op.email] || 0
      }))
      .filter(p => p.applications > 0)
      .sort((a, b) => b.applications - a.applications);
    
    const topPerformer = performersWithApplications.length > 0 
      ? performersWithApplications[0] 
      : { name: 'N/A', email: '', applications: 0, notDownloaded: 0 };
    
    const totalClients = new Set(operations.flatMap(op => op.managedUsers || [])).size;

    return {
      totalApplications,
      avgApplications,
      topPerformer,
      totalClients
    };
  }, [operations, operationsPerformance, notDownloadedMap]);

  const cards = [
    {
      title: 'Total Applications',
      value: stats.totalApplications,
      Icon: BarChart3,
      color: 'bg-blue-500'
    },
    {
      title: 'Top Performer',
      value: stats.topPerformer.name,
      subtitle: `${stats.topPerformer.applications} apps, ${stats.topPerformer.notDownloaded} not processed`,
      Icon: Award,
      color: 'bg-yellow-500'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      {cards.map((card, index) => {
        const IconComponent = card.Icon;
        return (
          <div key={index} className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-2">
              <div className={`${card.color} w-12 h-12 rounded-lg flex items-center justify-center`}>
                <IconComponent className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="text-sm text-slate-600 mb-1">{card.title}</div>
            <div className="text-2xl font-bold text-slate-900">
              {typeof card.value === 'number' ? (
                <AnimatedCounter value={card.value} loading={loading} />
              ) : (
                card.value
              )}
            </div>
            {card.subtitle && (
              <div className="text-xs text-slate-500 mt-1">
                {card.subtitle}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Priority 2: Performance Distribution Pie Chart
export function PerformanceDistributionPie({ operations, operationsPerformance }) {
  const chartData = useMemo(() => {
    const total = operations.reduce((sum, op) => sum + (operationsPerformance[op.email] || 0), 0);
    if (total === 0) return [];

    return operations
      .map(op => ({
        name: op.name || op.email.split('@')[0],
        value: operationsPerformance[op.email] || 0,
        percentage: total > 0 ? (((operationsPerformance[op.email] || 0) / total) * 100).toFixed(1) : 0
      }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [operations, operationsPerformance]);

  const COLORS = ['#10b981', '#059669', '#047857', '#065f46', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5'];

  if (chartData.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Performance Distribution</h3>
        <div className="flex items-center justify-center h-[300px] text-slate-500">
          <div className="text-center">
            <BarChart3 className="w-16 h-16 mx-auto mb-2 text-slate-300" />
            <p>No data available for the selected date range</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Performance Distribution</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percentage }) => `${name}: ${percentage}%`}
            outerRadius={100}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// Priority 2: Daily Trend Line Chart
export function DailyTrendLineChart({ operations, operationsPerformance, performanceDate, performanceEndDate }) {
  // Generate dates between start and end date
  const chartData = useMemo(() => {
    if (!performanceDate || !performanceEndDate) return [];
    
    const start = new Date(performanceDate);
    const end = new Date(performanceEndDate);
    const dates = [];
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d));
    }
    
    // For now, we'll show aggregated data per day
    // In a real implementation, you'd fetch daily breakdown from backend
    return dates.map(date => ({
      date: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      applications: Math.floor(Math.random() * 50) + 10 // Placeholder - would come from API
    }));
  }, [performanceDate, performanceEndDate]);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Daily Applications Trend</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="applications" stroke="#10b981" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Priority 3: Applications by Day of Week Bar Chart
export function DayOfWeekBarChart({ operations, operationsPerformance }) {
  const chartData = useMemo(() => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    // Placeholder data - in real implementation, would fetch from backend
    return days.map(day => ({
      day: day.substring(0, 3),
      applications: Math.floor(Math.random() * 30) + 5
    }));
  }, [operations, operationsPerformance]);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Applications by Day of Week</h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="applications" fill="#10b981" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Priority 3: Client Distribution Chart
export function ClientDistributionChart({ operations }) {
  const chartData = useMemo(() => {
    return operations
      .map(op => ({
        name: op.name || op.email.split('@')[0],
        clients: op.managedUsers?.length || 0
      }))
      .sort((a, b) => b.clients - a.clients);
  }, [operations]);

  const COLORS = ['#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95'];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Client Distribution</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="clients" fill="#8b5cf6" radius={[8, 8, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Priority 3: Performance Comparison Radar Chart
export function PerformanceRadarChart({ operations, operationsPerformance }) {
  const chartData = useMemo(() => {
    // Get top 5 performers for radar chart
    const topPerformers = operations
      .map(op => ({
        name: op.name || op.email.split('@')[0],
        applications: operationsPerformance[op.email] || 0,
        clients: op.managedUsers?.length || 0,
        saved: 0 // Would need to fetch from backend
      }))
      .sort((a, b) => b.applications - a.applications)
      .slice(0, 5);

    if (topPerformers.length === 0) return [];

    // Normalize data for radar chart (0-100 scale)
    const maxApplications = Math.max(...topPerformers.map(p => p.applications), 1);
    const maxClients = Math.max(...topPerformers.map(p => p.clients), 1);

    // Transform data for radar chart format
    const metrics = ['Applications', 'Clients', 'Saved Jobs'];
    const result = metrics.map(metric => {
      const dataPoint = { metric };
      topPerformers.forEach(performer => {
        let value = 0;
        if (metric === 'Applications') {
          value = (performer.applications / maxApplications) * 100;
        } else if (metric === 'Clients') {
          value = (performer.clients / maxClients) * 100;
        } else {
          value = (performer.saved / Math.max(maxApplications, 1)) * 100;
        }
        dataPoint[performer.name] = value;
      });
      return dataPoint;
    });

    return { data: result, performers: topPerformers.map(p => p.name) };
  }, [operations, operationsPerformance]);

  if (!chartData.data || chartData.data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Performance Comparison (Top 5)</h3>
        <div className="text-center text-slate-500 py-8">No data available</div>
      </div>
    );
  }

  const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Performance Comparison (Top 5)</h3>
      <ResponsiveContainer width="100%" height={400}>
        <RadarChart data={chartData.data}>
          <PolarGrid />
          <PolarAngleAxis dataKey="metric" />
          <PolarRadiusAxis angle={90} domain={[0, 100]} />
          {chartData.performers.map((name, index) => (
            <Radar
              key={name}
              name={name}
              dataKey={name}
              stroke={colors[index % colors.length]}
              fill={colors[index % colors.length]}
              fillOpacity={0.3}
            />
          ))}
          <Tooltip />
          <Legend />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}


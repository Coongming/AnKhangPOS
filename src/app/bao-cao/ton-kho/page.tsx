'use client';

import { useEffect, useState, useCallback } from 'react';
import { PackageSearch, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { formatCurrency, formatNumber } from '@/lib/utils';

interface StockReportData {
  totalStockValue: number;
  products: Array<{ id: string; code: string; name: string; unit: string; stock: number; minStock: number; costPrice: number; salePrice: number; category: { name: string } }>;
  bestSellers: Array<{ name: string; unit: string; totalQty: number; totalRevenue: number }>;
  worstSellers: Array<{ name: string; unit: string; totalQty: number; totalRevenue: number }>;
  lowStock: Array<{ id: string; name: string; stock: number; minStock: number; unit: string }>;
}

export default function StockReportPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<StockReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports?type=stock&period=${period}`);
      const json = await res.json();
      if (json && json.lowStock) {
        setData(json);
      } else {
        setData({ totalStockValue: 0, products: [], bestSellers: [], worstSellers: [], lowStock: [] });
      }
    } catch { showToast('error', 'Lỗi tải báo cáo'); }
    finally { setLoading(false); }
  }, [period, showToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="loading-page"><div className="loading-spinner" /></div>;
  if (!data) return null;

  return (
    <div>
      <div style={{ marginBottom: 24 }}><h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-heading)' }}>Báo cáo tồn kho & hàng hóa</h2></div>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="toolbar-left">
          {['week', 'month', 'year'].map((p) => (
            <button key={p} className={`btn ${period === p ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPeriod(p)}>
              {{ week: '7 ngày', month: 'Tháng này', year: 'Năm nay' }[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="card-grid card-grid-3" style={{ marginBottom: 24 }}>
        <div className="stat-card"><div className="stat-icon info"><PackageSearch size={22} /></div><div className="stat-content"><h3>Giá trị tồn kho</h3><div className="stat-value">{formatCurrency(data.totalStockValue)}</div></div></div>
        <div className="stat-card"><div className="stat-icon" style={{background:data.lowStock.length>0?'var(--danger-bg)':'var(--success-bg)',color:data.lowStock.length>0?'var(--danger)':'var(--success)'}}><AlertTriangle size={22} /></div>
          <div className="stat-content"><h3>Sắp hết hàng</h3><div className="stat-value">{data.lowStock.length} SP</div></div></div>
        <div className="stat-card"><div className="stat-icon accent"><PackageSearch size={22} /></div><div className="stat-content"><h3>Tổng sản phẩm</h3><div className="stat-value">{data.products.length}</div></div></div>
      </div>

      <div className="card-grid card-grid-2" style={{ marginBottom: 24 }}>
        <div className="card"><div className="card-header"><h3 className="card-title"><TrendingUp size={16} style={{display:'inline',marginRight:8,verticalAlign:-3,color:'var(--success)'}} />Hàng bán chạy</h3></div>
          {data.bestSellers.length === 0 ? <div className="empty-state"><TrendingUp /><h3>Chưa có dữ liệu</h3></div> : (
            <div className="table-wrapper"><table className="table"><thead><tr><th>Sản phẩm</th><th className="text-right">SL bán</th><th className="text-right">Doanh thu</th></tr></thead>
              <tbody>{data.bestSellers.map((p,i) => <tr key={i}><td style={{fontWeight:600}}>{p.name}</td><td className="text-right">{formatNumber(p.totalQty)} {p.unit}</td><td className="text-right font-bold text-success">{formatCurrency(p.totalRevenue)}</td></tr>)}</tbody>
            </table></div>
          )}
        </div>
        <div className="card"><div className="card-header"><h3 className="card-title"><TrendingDown size={16} style={{display:'inline',marginRight:8,verticalAlign:-3,color:'var(--danger)'}} />Hàng bán chậm</h3></div>
          {data.worstSellers.length === 0 ? <div className="empty-state"><TrendingDown /><h3>Chưa có dữ liệu</h3></div> : (
            <div className="table-wrapper"><table className="table"><thead><tr><th>Sản phẩm</th><th className="text-right">SL bán</th><th className="text-right">Doanh thu</th></tr></thead>
              <tbody>{data.worstSellers.map((p,i) => <tr key={i}><td style={{fontWeight:600}}>{p.name}</td><td className="text-right">{formatNumber(p.totalQty)} {p.unit}</td><td className="text-right font-bold">{formatCurrency(p.totalRevenue)}</td></tr>)}</tbody>
            </table></div>
          )}
        </div>
      </div>

      {data.lowStock.length > 0 && (
        <div className="card"><div className="card-header"><h3 className="card-title"><AlertTriangle size={16} style={{display:'inline',marginRight:8,verticalAlign:-3,color:'var(--warning)'}} />Hàng sắp hết</h3></div>
          <div className="table-wrapper"><table className="table"><thead><tr><th>Sản phẩm</th><th className="text-right">Tồn kho</th><th className="text-right">Tối thiểu</th></tr></thead>
            <tbody>{data.lowStock.map(p => <tr key={p.id}><td style={{fontWeight:600}}>{p.name}</td><td className="text-right text-danger font-bold">{formatNumber(p.stock)} {p.unit}</td><td className="text-right text-muted">{formatNumber(p.minStock)} {p.unit}</td></tr>)}</tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

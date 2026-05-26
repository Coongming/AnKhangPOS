'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Users, Edit3, Trash2, Clock, Truck, DollarSign, Search, ChevronDown, ChevronUp, Calendar, Save } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils';

interface Employee {
  id: string; code: string; name: string; phone: string | null; salaryType: string;
  hourlyRate: number; deliveryRate: number; isActive: boolean; notes: string | null;
  _count: { deliverySales: number; shifts: number };
}

interface Shift { id: string; employeeId: string; date: string; startTime: string; endTime: string; hours: number; notes: string | null; }
interface DeliveryItem { code: string; saleDate: string; customer: { name: string } | null; items: Array<{ quantity: number; product: { name: string; unit: string } }>; }
interface SalaryCalc {
  employee: Employee; totalHours: number; hourlyPay: number; deliveryPay: number; totalPay: number; remaining: number; totalAdvanced: number;
  totalBottles: number;
}

export default function EmployeesPage() {
  const { showToast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [loading, setLoading] = useState(true);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', salaryType: 'delivery', hourlyRate: '', deliveryRate: '', notes: '' });

  // Detail view
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [activeTab, setActiveTab] = useState<'shifts' | 'delivery' | 'salary'>('shifts');

  // Shifts
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftForm, setShiftForm] = useState({ date: new Date().toISOString().split('T')[0], startTime: '07:00', endTime: '17:00', notes: '' });

  // Delivery history
  const [deliveryHistory, setDeliveryHistory] = useState<DeliveryItem[]>([]);

  // Salary
  const [salaryDateFrom, setSalaryDateFrom] = useState('');
  const [salaryDateTo, setSalaryDateTo] = useState('');
  const [salaryCalc, setSalaryCalc] = useState<SalaryCalc | null>(null);
  const [salaryPeriodType, setSalaryPeriodType] = useState('monthly');
  const [salaryNotes, setSalaryNotes] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');



  const fetchData = useCallback(async () => {
    try {
      const [empRes] = await Promise.all([fetch('/api/employees')]);
      setEmployees(await empRes.json());
    } catch { showToast('error', 'Lỗi tải dữ liệu'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Set default salary period to this month
  useEffect(() => {
    const now = new Date();
    setSalaryDateFrom(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setSalaryDateTo(`${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`);
  }, []);

  // --- Employee CRUD ---
  const openCreate = () => { setEditingEmployee(null); setForm({ name: '', phone: '', salaryType: 'delivery', hourlyRate: '', deliveryRate: '', notes: '' }); setShowForm(true); };
  const openEdit = (e: Employee) => { setEditingEmployee(e); setForm({ name: e.name, phone: e.phone || '', salaryType: e.salaryType, hourlyRate: String(e.hourlyRate || ''), deliveryRate: String(e.deliveryRate || ''), notes: e.notes || '' }); setShowForm(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { showToast('error', 'Nhập tên NV'); return; }
    try {
      const method = editingEmployee ? 'PUT' : 'POST';
      const body = editingEmployee ? { id: editingEmployee.id, ...form } : form;
      const res = await fetch('/api/employees', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', editingEmployee ? 'Đã cập nhật' : 'Đã thêm nhân viên');
      setShowForm(false); fetchData();
    } catch (err) { showToast('error', err instanceof Error ? err.message : 'Lỗi'); }
  };

  const handleDelete = async (e: Employee) => {
    if (!confirm(`Xóa nhân viên ${e.name}?`)) return;
    try {
      const res = await fetch(`/api/employees?id=${e.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', 'Đã xóa'); fetchData();
    } catch (err) { showToast('error', err instanceof Error ? err.message : 'Lỗi'); }
  };

  const toggleActive = async (e: Employee) => {
    try {
      await fetch('/api/employees', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: e.id, isActive: !e.isActive }) });
      showToast('success', e.isActive ? 'Đã vô hiệu hóa' : 'Đã kích hoạt'); fetchData();
    } catch { showToast('error', 'Lỗi'); }
  };

  // --- Detail view ---
  const openDetail = async (e: Employee) => {
    setSelectedEmployee(e);
    setActiveTab('shifts');
    loadShifts(e.id);
    loadDeliveryHistory(e.id);
  };

  const loadShifts = async (employeeId: string) => {
    try {
      const res = await fetch(`/api/employee-shifts?employeeId=${employeeId}`);
      setShifts(await res.json());
    } catch { /* ignore */ }
  };

  const loadDeliveryHistory = async (employeeId: string) => {
    try {
      const res = await fetch(`/api/salary?action=delivery-history&employeeId=${employeeId}`);
      setDeliveryHistory(await res.json());
    } catch { /* ignore */ }
  };

  // --- Shifts ---
  const addShift = async () => {
    if (!selectedEmployee) return;
    try {
      const res = await fetch('/api/employee-shifts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: selectedEmployee.id, ...shiftForm }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', 'Đã thêm ca làm');
      loadShifts(selectedEmployee.id);
    } catch (err) { showToast('error', err instanceof Error ? err.message : 'Lỗi'); }
  };

  const deleteShift = async (shiftId: string) => {
    if (!selectedEmployee) return;
    try {
      await fetch(`/api/employee-shifts?id=${shiftId}`, { method: 'DELETE' });
      loadShifts(selectedEmployee.id);
    } catch { showToast('error', 'Lỗi xóa'); }
  };

  // --- Salary ---
  const calculateSalary = async () => {
    if (!selectedEmployee || !salaryDateFrom || !salaryDateTo) { showToast('error', 'Chọn khoảng thời gian'); return; }
    try {
      const res = await fetch(`/api/salary?action=calculate&employeeId=${selectedEmployee.id}&dateFrom=${salaryDateFrom}&dateTo=${salaryDateTo}`);
      if (!res.ok) throw new Error((await res.json()).error);
      setSalaryCalc(await res.json());
    } catch (err) { showToast('error', err instanceof Error ? err.message : 'Lỗi'); }
  };

  const payFullSalary = async () => {
    if (!salaryCalc || !selectedEmployee) return;
    if (!confirm(`Xuất lương ${formatCurrency(salaryCalc.remaining)} cho ${selectedEmployee.name}?`)) return;
    try {
      const res = await fetch('/api/salary', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedEmployee.id, periodType: salaryPeriodType,
          periodStart: salaryDateFrom, periodEnd: salaryDateTo,
          hourlyPay: salaryCalc.hourlyPay, deliveryPay: salaryCalc.deliveryPay,
          totalPay: salaryCalc.remaining, type: 'salary', notes: salaryNotes,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', 'Đã xuất lương! Chi phí đã được tự động ghi nhận 📋');
      calculateSalary();
    } catch (err) { showToast('error', err instanceof Error ? err.message : 'Lỗi'); }
  };

  const payAdvance = async () => {
    if (!selectedEmployee || !advanceAmount) { showToast('error', 'Nhập số tiền ứng'); return; }
    if (!confirm(`Ứng lương ${formatCurrency(parseFloat(advanceAmount))} cho ${selectedEmployee.name}?`)) return;
    try {
      const res = await fetch('/api/salary', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedEmployee.id, periodType: salaryPeriodType,
          periodStart: salaryDateFrom, periodEnd: salaryDateTo,
          totalPay: advanceAmount, type: 'advance', notes: `Ứng lương - ${salaryNotes}`,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', 'Đã ứng lương! Chi phí đã được tự động ghi nhận');
      setAdvanceAmount('');
      calculateSalary();
    } catch (err) { showToast('error', err instanceof Error ? err.message : 'Lỗi'); }
  };



  const salaryTypeLabel = (t: string) => t === 'hourly' ? '⏰ Theo giờ' : t === 'delivery' ? '🚚 Theo giao hàng' : '⏰🚚 Cả hai';

  if (loading) return <div className="loading-page"><div className="loading-spinner" /></div>;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-heading)' }}>👨‍💼 Quản lý nhân viên</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{employees.length} nhân viên</p>
      </div>

      <div className="toolbar">
        <div className="toolbar-left"></div>
        <div className="toolbar-right">
          <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Thêm nhân viên</button>
        </div>
      </div>

      {/* Employee List */}
      {employees.length === 0 ? (
        <div className="card"><div className="empty-state"><Users /><h3>Chưa có nhân viên</h3></div></div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Mã</th><th>Tên</th><th>SĐT</th><th>Chế độ lương</th><th className="text-right">Lương/giờ</th><th className="text-right">Lương/bình</th><th className="text-center">Số đơn giao</th><th>Trạng thái</th><th className="text-center">Thao tác</th></tr></thead>
            <tbody>
              {employees.map(e => (
                <tr key={e.id} style={{ opacity: e.isActive ? 1 : 0.5, cursor: 'pointer' }} onClick={() => openDetail(e)}>
                  <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{e.code}</td>
                  <td style={{ fontWeight: 600 }}>{e.name}</td>
                  <td className="text-muted">{e.phone || '—'}</td>
                  <td>{salaryTypeLabel(e.salaryType)}</td>
                  <td className="text-right">{e.salaryType !== 'delivery' ? formatCurrency(e.hourlyRate) : '—'}</td>
                  <td className="text-right">{e.salaryType !== 'hourly' ? formatCurrency(e.deliveryRate) + '/bình' : '—'}</td>
                  <td className="text-center">{e._count.deliverySales}</td>
                  <td><span className={`badge ${e.isActive ? 'badge-success' : 'badge-danger'}`}>{e.isActive ? 'Đang làm' : 'Nghỉ'}</span></td>
                  <td className="text-center" onClick={ev => ev.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(e)}><Edit3 size={14} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(e)}>{e.isActive ? '🔒' : '🔓'}</button>
                      <button className="btn btn-ghost btn-sm text-danger" onClick={() => handleDelete(e)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>{editingEmployee ? `Sửa ${editingEmployee.code}` : 'Thêm nhân viên'}</h3><button className="modal-close" onClick={() => setShowForm(false)}>✕</button></div>
            <div className="modal-body">
              <div className="form-group"><label className="form-label">Tên *</label><input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="form-row form-row-2">
                <div className="form-group"><label className="form-label">SĐT</label><input className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="form-group"><label className="form-label">Chế độ lương</label>
                  <select className="form-select" value={form.salaryType} onChange={e => setForm({ ...form, salaryType: e.target.value })}>
                    <option value="hourly">⏰ Theo giờ</option>
                    <option value="delivery">🚚 Theo giao hàng</option>
                    <option value="both">⏰🚚 Cả hai</option>
                  </select>
                </div>
              </div>
              {(form.salaryType === 'hourly' || form.salaryType === 'both') && (
                <div className="form-group"><label className="form-label">Lương/giờ (VNĐ)</label><input className="form-input" type="number" value={form.hourlyRate} onChange={e => setForm({ ...form, hourlyRate: e.target.value })} /></div>
              )}
              {(form.salaryType === 'delivery' || form.salaryType === 'both') && (
                <div className="form-group"><label className="form-label">Lương/bình (VNĐ)</label><input className="form-input" type="number" value={form.deliveryRate} onChange={e => setForm({ ...form, deliveryRate: e.target.value })} placeholder="VD: 6000" /></div>
              )}
              <div className="form-group"><label className="form-label">Ghi chú</label><input className="form-input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Hủy</button>
                <button className="btn btn-primary" onClick={handleSave}>{editingEmployee ? 'Cập nhật' : 'Thêm'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Employee Detail Modal */}
      {selectedEmployee && (
        <div className="modal-overlay" onClick={() => { setSelectedEmployee(null); setSalaryCalc(null); }}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3>{selectedEmployee.code} - {selectedEmployee.name} ({salaryTypeLabel(selectedEmployee.salaryType)})</h3>
              <button className="modal-close" onClick={() => { setSelectedEmployee(null); setSalaryCalc(null); }}>✕</button>
            </div>
            <div className="modal-body">
              {/* Tabs */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
                <button className={`btn btn-sm ${activeTab === 'shifts' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab('shifts')}><Clock size={14} /> Chấm công</button>
                <button className={`btn btn-sm ${activeTab === 'delivery' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab('delivery')}><Truck size={14} /> Lịch sử giao ({deliveryHistory.length})</button>
                <button className={`btn btn-sm ${activeTab === 'salary' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab('salary')}><DollarSign size={14} /> Tính lương</button>
              </div>

              {/* SHIFTS TAB */}
              {activeTab === 'shifts' && (
                <div>
                  <div className="form-row form-row-3" style={{ marginBottom: 12, alignItems: 'flex-end' }}>
                    <div className="form-group"><label className="form-label">Ngày</label><input className="form-input" type="date" value={shiftForm.date} onChange={e => setShiftForm({ ...shiftForm, date: e.target.value })} /></div>
                    <div className="form-group"><label className="form-label">Bắt đầu</label><input className="form-input" type="time" value={shiftForm.startTime} onChange={e => setShiftForm({ ...shiftForm, startTime: e.target.value })} /></div>
                    <div className="form-group"><label className="form-label">Kết thúc</label><input className="form-input" type="time" value={shiftForm.endTime} onChange={e => setShiftForm({ ...shiftForm, endTime: e.target.value })} /></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <input className="form-input" placeholder="Ghi chú ca..." value={shiftForm.notes} onChange={e => setShiftForm({ ...shiftForm, notes: e.target.value })} style={{ flex: 1 }} />
                    <button className="btn btn-primary" onClick={addShift}><Plus size={14} /> Thêm ca</button>
                  </div>
                  {shifts.length > 0 && (
                    <div className="table-wrapper">
                      <table className="table">
                        <thead><tr><th>Ngày</th><th>Ca</th><th className="text-right">Số giờ</th><th>Ghi chú</th><th style={{ width: 40 }}></th></tr></thead>
                        <tbody>
                          {shifts.map(s => (
                            <tr key={s.id}>
                              <td>{formatDate(s.date)}</td>
                              <td>{s.startTime} - {s.endTime}</td>
                              <td className="text-right font-bold">{s.hours}h</td>
                              <td className="text-muted">{s.notes || '—'}</td>
                              <td><button className="btn btn-ghost btn-sm" onClick={() => deleteShift(s.id)}><Trash2 size={14} /></button></td>
                            </tr>
                          ))}
                          <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border-color)' }}>
                            <td colSpan={2}>Tổng</td>
                            <td className="text-right">{shifts.reduce((s, sh) => s + sh.hours, 0).toFixed(1)}h</td>
                            <td colSpan={2}></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* DELIVERY TAB */}
              {activeTab === 'delivery' && (
                <div>
                  {deliveryHistory.length === 0 ? (
                    <div className="empty-state" style={{ padding: 40 }}><Truck /><h3>Chưa có đơn giao</h3></div>
                  ) : (
                    <div className="table-wrapper">
                      <table className="table">
                        <thead><tr><th>Mã HĐ</th><th>Ngày</th><th>Khách</th><th>Sản phẩm</th></tr></thead>
                        <tbody>
                          {deliveryHistory.map((d, i) => (
                            <tr key={i}>
                              <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{d.code}</td>
                              <td>{formatDate(d.saleDate)}</td>
                              <td>{d.customer?.name || 'Khách lẻ'}</td>
                              <td>{d.items.map(it => `${it.product.name} (${it.quantity} ${it.product.unit})`).join(', ')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* SALARY TAB */}
              {activeTab === 'salary' && (
                <div>
                  <div className="form-row form-row-3" style={{ marginBottom: 12, alignItems: 'flex-end' }}>
                    <div className="form-group"><label className="form-label">Từ ngày</label><input className="form-input" type="date" value={salaryDateFrom} onChange={e => setSalaryDateFrom(e.target.value)} /></div>
                    <div className="form-group"><label className="form-label">Đến ngày</label><input className="form-input" type="date" value={salaryDateTo} onChange={e => setSalaryDateTo(e.target.value)} /></div>
                    <div className="form-group"><label className="form-label">Kỳ</label>
                      <select className="form-select" value={salaryPeriodType} onChange={e => setSalaryPeriodType(e.target.value)}>
                        <option value="daily">Ngày</option><option value="weekly">Tuần</option><option value="monthly">Tháng</option>
                      </select>
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={calculateSalary} style={{ marginBottom: 16 }}><DollarSign size={14} /> Tính lương</button>

                  {salaryCalc && (
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', padding: 20, border: '1px solid var(--border-color)' }}>
                      {/* Hourly */}
                      {(selectedEmployee.salaryType === 'hourly' || selectedEmployee.salaryType === 'both') && (
                        <div style={{ marginBottom: 12 }}>
                          <strong>⏰ Lương theo giờ:</strong>
                          <div className="text-muted" style={{ fontSize: 13 }}>{salaryCalc.totalHours.toFixed(1)} giờ × {formatCurrency(selectedEmployee.hourlyRate)}/h</div>
                          <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{formatCurrency(salaryCalc.hourlyPay)}</div>
                        </div>
                      )}

                      {/* Delivery */}
                      {(selectedEmployee.salaryType === 'delivery' || selectedEmployee.salaryType === 'both') && (
                        <div style={{ marginBottom: 12 }}>
                          <strong>🚚 Lương giao hàng:</strong>
                          <div className="text-muted" style={{ fontSize: 13 }}>{salaryCalc.totalBottles} bình × {formatCurrency(selectedEmployee.deliveryRate)}/bình</div>
                          <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{formatCurrency(salaryCalc.deliveryPay)}</div>
                        </div>
                      )}

                      <div style={{ borderTop: '2px solid var(--border-color)', paddingTop: 12, marginTop: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16 }}>
                          <span>Tổng lương:</span><strong>{formatCurrency(salaryCalc.totalPay)}</strong>
                        </div>
                        {salaryCalc.totalAdvanced > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--warning)' }}>
                            <span>Đã ứng:</span><strong>-{formatCurrency(salaryCalc.totalAdvanced)}</strong>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, marginTop: 8, color: 'var(--success)' }}>
                          <span>Còn lại:</span><span>{formatCurrency(salaryCalc.remaining)}</span>
                        </div>
                      </div>

                      {/* Salary Notes + Actions */}
                      <div className="form-group" style={{ marginTop: 12 }}>
                        <input className="form-input" value={salaryNotes} onChange={e => setSalaryNotes(e.target.value)} placeholder="Ghi chú lương..." />
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button className="btn btn-success" onClick={payFullSalary} disabled={salaryCalc.remaining <= 0}>
                          <Save size={14} /> Xuất lương ({formatCurrency(salaryCalc.remaining)})
                        </button>
                        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                          <input className="form-input" type="number" placeholder="Số tiền ứng..." value={advanceAmount} onChange={e => setAdvanceAmount(e.target.value)} />
                          <button className="btn btn-ghost" onClick={payAdvance} disabled={!advanceAmount}>Ứng lương</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

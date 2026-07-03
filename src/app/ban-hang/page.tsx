'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft,
  AlertCircle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Copy,
  CreditCard,
  Minus,
  PackageOpen,
  Phone,
  Plus,
  ReceiptText,
  Search,
  ShoppingCart,
  StickyNote,
  Trash2,
  Truck,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import { useToast } from '@/components/Toast';
import { formatCurrency, formatOrderForCopy } from '@/lib/utils';
import InvoiceModal from '@/components/InvoiceModal';

interface Product { id: string; code: string; name: string; unit: string; salePrice: number; costPrice: number; stock: number; category: { name: string }; }
interface Customer { id: string; code: string; name: string; phone: string | null; debt: number; }
interface EmployeeItem { id: string; code: string; name: string; isActive: boolean; }
interface CartItem { productId: string; name: string; unit: string; stock: number; quantity: number; unitPrice: number; discount: number; }
interface SaleHistory {
  id: string;
  code: string;
  saleDate: string;
  totalAmount: number;
  customer: { name: string; phone: string | null } | null;
  items: {
    productId: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    product: { name: string; unit: string; stock: number };
  }[];
}
interface PendingSale {
  id: string;
  code: string;
  saleDate: string;
  totalAmount: number;
  notes: string | null;
  customer: { name: string; phone: string | null } | null;
  items: { product: { name: string; unit: string }; quantity: number; unitPrice: number; totalPrice: number }[];
}

export default function SalesPage() {
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchProduct, setSearchProduct] = useState('');
  const [searchCustomer, setSearchCustomer] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showQuickCustomerForm, setShowQuickCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [orderDiscount, setOrderDiscount] = useState('0');
  const [paidAmount, setPaidAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash');
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [employeesList, setEmployeesList] = useState<EmployeeItem[]>([]);
  const [deliveryEmployeeId, setDeliveryEmployeeId] = useState('');
  const [invoiceData, setInvoiceData] = useState<any>(null);
  const [showInvoice, setShowInvoice] = useState(false);
  const [showOrderHistory, setShowOrderHistory] = useState(false);
  const [searchHistory, setSearchHistory] = useState('');
  const [saleHistory, setSaleHistory] = useState<SaleHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
  const [selectedPending, setSelectedPending] = useState<PendingSale | null>(null);
  const [completingPending, setCompletingPending] = useState(false);
  const [deletingPending, setDeletingPending] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [prodRes, custRes, empRes] = await Promise.all([
        fetch('/api/products?status=active'),
        fetch('/api/customers'),
        fetch('/api/employees'),
      ]);
      const prods = await prodRes.json();
      setProducts(Array.isArray(prods) ? prods : []);
      const custs = await custRes.json();
      setCustomers(Array.isArray(custs) ? custs : []);
      const emps = await empRes.json();
      setEmployeesList(Array.isArray(emps) ? emps.filter((e: EmployeeItem) => e.isActive) : []);
    } catch { showToast('error', 'Lỗi tải dữ liệu'); }
  }, [showToast]);

  useEffect(() => { fetchData(); fetchPendingSales(); }, [fetchData]);

  const fetchPendingSales = async () => {
    try {
      const res = await fetch('/api/sales?status=pending');
      if (res.ok) setPendingSales(await res.json());
    } catch { /* silent */ }
  };

  const completePendingSale = async () => {
    if (!selectedPending) return;
    setCompletingPending(true);
    try {
      const res = await fetch('/api/sales', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedPending.id,
          action: 'complete',
          paymentMethod,
          paidAmount: String(parseFloat(paidAmount) || 0),
          deliveryEmployeeId: deliveryEmployeeId || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      
      showToast('success', `Đã hoàn thành đơn ${selectedPending.code}`);
      setSelectedPending(null);
      setShowPending(false);
      setPaidAmount('');
      setDeliveryEmployeeId('');
      setPaymentMethod('cash');
      fetchPendingSales();
      fetchData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Lỗi hoàn thành đơn');
    } finally { setCompletingPending(false); }
  };

  const deletePendingSale = async () => {
    if (!selectedPending) return;
    if (!confirm(`Xóa đơn chờ ${selectedPending.code}?`)) return;

    setDeletingPending(true);
    try {
      const res = await fetch('/api/sales', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedPending.id, action: 'deletePending' }),
      });
      if (!res.ok) throw new Error((await res.json()).error);

      showToast('success', `Đã xóa đơn ${selectedPending.code}`);
      setSelectedPending(null);
      setPaidAmount('');
      setDeliveryEmployeeId('');
      setPaymentMethod('cash');
      fetchPendingSales();
      fetchData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Lỗi xóa đơn');
    } finally {
      setDeletingPending(false);
    }
  };

  const filteredProducts = products.filter((p) =>
    searchProduct && (p.name.toLowerCase().includes(searchProduct.toLowerCase()) || p.code.toLowerCase().includes(searchProduct.toLowerCase()))
  );

  const trimmedCustomerSearch = searchCustomer.trim();
  const customerSearchQuery = trimmedCustomerSearch.toLowerCase();
  const filteredCustomers = customers.filter((c) =>
    customerSearchQuery && (
      c.name.toLowerCase().includes(customerSearchQuery)
      || (c.phone && c.phone.includes(trimmedCustomerSearch))
      || c.code.toLowerCase().includes(customerSearchQuery)
    )
  );

  const addToCart = (product: Product) => {
    const existing = cart.find((c) => c.productId === product.id);
    if (existing) {
      setCart(cart.map((c) => c.productId === product.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, { productId: product.id, name: product.name, unit: product.unit, stock: product.stock, quantity: 1, unitPrice: product.salePrice, discount: 0 }]);
    }
    setSearchProduct('');
  };

  const updateQty = (productId: string, delta: number) => {
    setCart(cart.map((c) => c.productId === productId ? { ...c, quantity: Math.max(1, c.quantity + delta) } : c).filter((c) => c.quantity > 0));
  };

  const updateCartField = (productId: string, field: string, value: number) => {
    setCart(cart.map((c) => c.productId === productId ? { ...c, [field]: value } : c));
  };

  const removeFromCart = (productId: string) => setCart(cart.filter((c) => c.productId !== productId));

  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice - item.discount, 0);
  const discount = parseFloat(orderDiscount) || 0;
  const totalAmount = subtotal - discount;
  const paid = parseFloat(paidAmount) || 0;
  const debtAmount = Math.max(0, totalAmount - paid);

  const handleSubmit = async (status?: 'pending') => {
    if (cart.length === 0) { showToast('error', 'Vui lòng thêm sản phẩm'); return; }
    if (!selectedCustomer && searchCustomer.trim()) {
      showToast('error', 'Chọn hoặc thêm khách hàng, hoặc xóa ô khách để bán khách lẻ');
      return;
    }
    if (!status && debtAmount > 0 && !selectedCustomer) { showToast('error', 'Bán nợ phải chọn khách hàng'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer?.id || null,
          items: cart.map((c) => ({ productId: c.productId, quantity: String(c.quantity), unitPrice: String(c.unitPrice), discount: String(c.discount) })),
          paidAmount: String(paid),
          discount: String(discount),
          notes,
          paymentMethod,
          deliveryEmployeeId: deliveryEmployeeId || null,
          status,
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error);
      const sale = await res.json();
      showToast('success', `Đã tạo hóa đơn ${sale.code}`);

// Lưu tạm trước khi reset (chỉ khi không phải đơn chờ)
if (status !== 'pending') {
  const _subtotal = subtotal;
  const _discount = discount;
  const _totalAmount = totalAmount;
  const _paid = paid;
  const _debtAmount = debtAmount;
  const _cart = [...cart];
  const _customer = selectedCustomer;
  const _paymentMethod = paymentMethod;
  const _notes = notes;

  setInvoiceData({
    code: sale.code,
    saleDate: sale.saleDate,
    customerName: _customer?.name || null,
    customerPhone: _customer?.phone || null,
    paymentMethod: _paymentMethod,
    items: _cart.map(c => ({
      name: c.name,
      unit: c.unit,
      quantity: c.quantity,
      unitPrice: c.unitPrice,
      discount: c.discount,
      totalPrice: c.quantity * c.unitPrice - c.discount,
    })),
    subtotal: _subtotal,
    discount: _discount,
    totalAmount: _totalAmount,
    paidAmount: _paid,
    debtAmount: _debtAmount,
    customerDebt: _customer ? (_customer.debt || 0) + _debtAmount : 0,
    notes: _notes || null,
  });
}

// Auto copy order for shipper
      if (deliveryEmployeeId) {
        const orderText = formatOrderForCopy({
          customer: selectedCustomer ? { name: selectedCustomer.name } : null,
          phone: selectedCustomer?.phone || null,
          items: cart.map(c => ({
            quantity: c.quantity,
            unitPrice: c.unitPrice,
            totalPrice: c.quantity * c.unitPrice - c.discount,
            product: { name: c.name, unit: c.unit },
          })),
          totalAmount,
          notes: notes || null,
        });
        try {
          await navigator.clipboard.writeText(orderText);
          showToast('success', '📋 Đã copy đơn giao hàng!');
        } catch { /* clipboard may fail on some browsers */ }
      }

      // Reset
      setCart([]); setSelectedCustomer(null); setOrderDiscount('0'); setPaidAmount(''); setNotes(''); setPaymentMethod('cash'); setDeliveryEmployeeId('');
      fetchData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Lỗi tạo hóa đơn');
    } finally { setSubmitting(false); }
  };

  const payFull = () => setPaidAmount(String(totalAmount));
  const isLikelyPhone = (value: string) => /^[0-9+\-\s().]{6,}$/.test(value.trim());

  const openQuickCustomerForm = () => {
    const query = searchCustomer.trim();
    setNewCustomerName(isLikelyPhone(query) ? '' : query);
    setNewCustomerPhone(isLikelyPhone(query) ? query : '');
    setShowQuickCustomerForm(true);
  };

  const createQuickCustomer = async () => {
    if (!newCustomerName.trim()) {
      showToast('error', 'Nhập tên khách hàng');
      return;
    }

    setAddingCustomer(true);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCustomerName.trim(),
          phone: newCustomerPhone.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi thêm khách hàng');

      setSelectedCustomer(data);
      setCustomers((prev) => [data, ...prev]);
      setSearchCustomer('');
      setShowCustomerSearch(false);
      setShowQuickCustomerForm(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
      showToast('success', `Đã thêm khách hàng ${data.name}`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Lỗi thêm khách hàng');
    } finally {
      setAddingCustomer(false);
    }
  };

  const searchSaleHistory = async (query: string) => {
    if (!query.trim()) { setSaleHistory([]); return; }
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/sales/history?q=${encodeURIComponent(query)}`);
      if (res.ok) setSaleHistory(await res.json());
    } catch { showToast('error', 'Lỗi tìm đơn cũ'); }
    finally { setLoadingHistory(false); }
  };
  
  const copyOldOrder = (sale: SaleHistory) => {
    const newCart: CartItem[] = sale.items
      .filter(item => products.find(p => p.id === item.productId))
      .map(item => {
        const product = products.find(p => p.id === item.productId)!;
        return {
          productId: item.productId,
          name: item.product.name,
          unit: item.product.unit,
          stock: product.stock,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
        };
      });
    setCart(newCart);
    if (sale.customer) {
      const customer = customers.find(c => c.name === sale.customer!.name);
      if (customer) setSelectedCustomer(customer);
    }
    setShowOrderHistory(false);
    showToast('success', `Đã copy đơn ${sale.code}`);
  };

  const formatPreviewItems = (items: Array<{ product: { name: string; unit: string }; quantity: number }>) => {
    const preview = items.slice(0, 3).map((item) => `${item.product.name} x${item.quantity}`);
    const hiddenCount = items.length - preview.length;
    return `${preview.join(', ')}${hiddenCount > 0 ? ` +${hiddenCount}` : ''}`;
  };

  const closePendingModal = () => {
    setShowPending(false);
    setSelectedPending(null);
  };

  const selectedPendingPaid = parseFloat(paidAmount) || 0;
  const selectedPendingDebt = selectedPending
    ? Math.max(0, selectedPending.totalAmount - selectedPendingPaid)
    : 0;
  const showCustomerNotFound = showCustomerSearch && !!trimmedCustomerSearch && filteredCustomers.length === 0;

  return (
    <>
      {showInvoice && invoiceData && (
        <InvoiceModal
          invoice={invoiceData}
          onClose={() => setShowInvoice(false)}
        />
      )}
      {showPending && (
        <div className="modal-overlay" onClick={closePendingModal}>
          <div className="modal order-modal" onClick={e => e.stopPropagation()}>
            <div className="order-modal-header">
              <div className="order-modal-title">
                <span className="order-modal-icon"><ClipboardList /></span>
                <div>
                  <h3>Đơn chờ giao hàng</h3>
                  <p>{pendingSales.length} đơn đang chờ xử lý</p>
                </div>
              </div>
              <button className="modal-close" onClick={closePendingModal} title="Đóng">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body order-modal-body">
              {pendingSales.length === 0 ? (
                <div className="empty-state order-empty-state">
                  <PackageOpen />
                  <h3>Chưa có đơn chờ</h3>
                  <p>Các đơn lưu chờ sẽ nằm ở đây.</p>
                </div>
              ) : !selectedPending ? (
                <div className="order-list">
                  {pendingSales.map((sale) => (
                    <button
                      key={sale.id}
                      type="button"
                      className="order-card"
                      onClick={() => setSelectedPending(sale)}
                    >
                      <div className="order-card-top">
                        <div>
                          <div className="order-code-row">
                            <span className="order-code">{sale.code}</span>
                            <span className="badge badge-warning">Đang chờ</span>
                          </div>
                          <div className="order-customer">
                            <User size={14} />
                            <span>{sale.customer?.name || 'Khách lẻ'}</span>
                            {sale.customer?.phone && (
                              <>
                                <span className="order-dot">•</span>
                                <Phone size={13} />
                                <span>{sale.customer.phone}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="order-card-arrow" />
                      </div>
                      <div className="order-item-preview">
                        {formatPreviewItems(sale.items)}
                      </div>
                      {sale.notes && (
                        <div className="order-note">
                          <StickyNote size={14} />
                          <span>{sale.notes}</span>
                        </div>
                      )}
                      <div className="order-card-footer">
                        <span><CalendarDays size={14} />{new Date(sale.saleDate).toLocaleDateString('vi-VN')}</span>
                        <strong>{formatCurrency(sale.totalAmount)}</strong>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="order-detail">
                  <button className="btn btn-ghost btn-sm order-back-btn" onClick={() => setSelectedPending(null)} type="button">
                    <ArrowLeft size={15} /> Danh sách đơn chờ
                  </button>
                  <div className="order-detail-head">
                    <div>
                      <div className="order-code-row">
                        <span className="order-code">{selectedPending.code}</span>
                        <span className="badge badge-warning">Đang chờ</span>
                      </div>
                      <div className="order-customer order-detail-customer">
                        <User size={14} />
                        <span>{selectedPending.customer?.name || 'Khách lẻ'}</span>
                        {selectedPending.customer?.phone && (
                          <>
                            <span className="order-dot">•</span>
                            <Phone size={13} />
                            <span>{selectedPending.customer.phone}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="order-detail-total">
                      <span>Tổng đơn</span>
                      <strong>{formatCurrency(selectedPending.totalAmount)}</strong>
                    </div>
                  </div>

                  <div className="order-lines">
                    <div className="order-lines-title">Sản phẩm</div>
                    <div className="order-line-list">
                      {selectedPending.items.map((item, i) => (
                        <div key={i} className="order-line">
                          <div>
                            <span>{item.product.name}</span>
                            <small>{item.quantity} {item.product.unit} x {formatCurrency(item.unitPrice)}</small>
                          </div>
                          <strong>{formatCurrency(item.totalPrice)}</strong>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedPending.notes && (
                    <div className="order-note order-note-detail">
                      <StickyNote size={14} />
                      <span>{selectedPending.notes}</span>
                    </div>
                  )}

                  <div className="form-group order-form-group">
                    <label className="form-label">Nhân viên giao hàng</label>
                    <select className="form-select" value={deliveryEmployeeId} onChange={(e) => setDeliveryEmployeeId(e.target.value)}>
                      <option value="">Không có</option>
                      {employeesList.map((e) => <option key={e.id} value={e.id}>{e.code} - {e.name}</option>)}
                    </select>
                  </div>

                  <div className="form-group order-form-group">
                    <label className="form-label">Phương thức thanh toán</label>
                    <div className="order-payment-switch">
                      <button className={paymentMethod === 'cash' ? 'active' : ''} onClick={() => setPaymentMethod('cash')} type="button">
                        <Banknote size={16} /> Tiền mặt
                      </button>
                      <button className={paymentMethod === 'transfer' ? 'active' : ''} onClick={() => setPaymentMethod('transfer')} type="button">
                        <CreditCard size={16} /> Chuyển khoản
                      </button>
                    </div>
                  </div>

                  <div className="order-pay-box">
                    <div className="order-pay-head">
                      <label className="form-label">Số tiền khách trả</label>
                      <button className="btn btn-ghost btn-sm" onClick={() => setPaidAmount(String(selectedPending.totalAmount))} type="button">
                        <CheckCircle2 size={14} /> Trả đủ
                      </button>
                    </div>
                    <input className="form-input order-pay-input" type="number" min="0" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder="0" />
                    <div className={selectedPendingDebt > 0 ? 'order-remaining warning' : 'order-remaining'}>
                      <span>{selectedPendingDebt > 0 ? 'Còn nợ' : 'Đã thanh toán đủ'}</span>
                      <strong>{selectedPendingDebt > 0 ? formatCurrency(selectedPendingDebt) : formatCurrency(selectedPending.totalAmount)}</strong>
                    </div>
                  </div>

                  <div className="order-action-row">
                    <button className="btn btn-danger btn-lg" onClick={deletePendingSale} disabled={deletingPending || completingPending} type="button">
                      <Trash2 size={18} />
                      {deletingPending ? 'Đang xóa...' : 'Xóa đơn'}
                    </button>
                    <button className="btn btn-success btn-lg order-complete-btn" onClick={completePendingSale} disabled={completingPending || deletingPending} type="button">
                      <CheckCircle2 size={18} />
                      {completingPending ? 'Đang xử lý...' : 'Hoàn tất đơn'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showOrderHistory && (
        <div className="modal-overlay" onClick={() => setShowOrderHistory(false)}>
          <div className="modal order-modal" onClick={e => e.stopPropagation()}>
            <div className="order-modal-header">
              <div className="order-modal-title">
                <span className="order-modal-icon"><ReceiptText /></span>
                <div>
                  <h3>Copy đơn cũ</h3>
                  <p>Tìm theo tên hoặc số điện thoại khách hàng</p>
                </div>
              </div>
              <button className="modal-close" onClick={() => setShowOrderHistory(false)} title="Đóng">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body order-modal-body">
              <div className="search-box order-history-search">
                <Search size={18} />
                <input
                  placeholder="Nhập tên hoặc số điện thoại khách hàng..."
                  value={searchHistory}
                  autoFocus
                  onChange={(e) => {
                    setSearchHistory(e.target.value);
                    searchSaleHistory(e.target.value);
                  }}
                />
              </div>

              {loadingHistory && <div className="loading-spinner" style={{ margin: '40px auto' }}></div>}

              {!loadingHistory && saleHistory.length > 0 && (
                <div className="order-list">
                  {saleHistory.map((sale) => (
                    <button
                      key={sale.id}
                      type="button"
                      className="order-card"
                      onClick={() => copyOldOrder(sale)}
                    >
                      <div className="order-card-top">
                        <div>
                          <div className="order-code-row">
                            <span className="order-code">{sale.code}</span>
                            <span className="badge badge-neutral">{sale.items.length} món</span>
                          </div>
                          <div className="order-customer">
                            <User size={14} />
                            <span>{sale.customer?.name || 'Khách lẻ'}</span>
                            {sale.customer?.phone && (
                              <>
                                <span className="order-dot">•</span>
                                <Phone size={13} />
                                <span>{sale.customer.phone}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <Copy className="order-card-arrow" />
                      </div>
                      <div className="order-item-preview">
                        {formatPreviewItems(sale.items)}
                      </div>
                      <div className="order-card-footer">
                        <span><CalendarDays size={14} />{new Date(sale.saleDate).toLocaleDateString('vi-VN')}</span>
                        <strong>{formatCurrency(sale.totalAmount)}</strong>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {!loadingHistory && searchHistory && saleHistory.length === 0 && (
                <div className="empty-state order-empty-state">
                  <Search />
                  <h3>Không tìm thấy</h3>
                  <p>Không có đơn hàng nào khớp với từ khóa</p>
                </div>
              )}

              {!loadingHistory && !searchHistory && saleHistory.length === 0 && (
                <div className="empty-state order-empty-state">
                  <ReceiptText />
                  <h3>Sẵn sàng tìm đơn cũ</h3>
                  <p>Nhập thông tin khách để copy nhanh vào giỏ hàng.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 20, height: 'calc(100vh - var(--header-height) - 48px)' }}>
          {/* LEFT: Product Search + Cart */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-heading)', margin: 0 }}>
              <ShoppingCart size={22} style={{ display: 'inline', marginRight: 8, verticalAlign: -3 }} />
              Bán hàng
            </h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => { setShowPending(true); fetchPendingSales(); }} style={{ fontSize: 13, position: 'relative' }}>
                <ClipboardList size={15} style={{ marginRight: 6 }} />
                Đơn chờ
                {pendingSales.length > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, right: -4,
                    background: 'var(--danger)', color: '#fff',
                    borderRadius: '50%', width: 16, height: 16,
                    fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{pendingSales.length}</span>
                )}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowOrderHistory(true)} style={{ fontSize: 13 }}>
                <Copy size={15} style={{ marginRight: 6 }} /> Đơn cũ
              </button>
            </div>
          </div>
          {/* Product Search */}
          <div style={{ position: 'relative' }}>
            <div className="search-box">
              <Search />
              <input placeholder="Tìm sản phẩm (tên hoặc mã)..." value={searchProduct} onChange={(e) => setSearchProduct(e.target.value)} autoFocus />
            </div>
            {filteredProducts.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', zIndex: 10, maxHeight: 250, overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
                {filteredProducts.map((p) => (
                  <div key={p.id} onClick={() => addToCart(p)} style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)' }} className="nav-item">
                    <div>
                      <span style={{ fontWeight: 600 }}>{p.name}</span>
                      <span className="text-muted" style={{ marginLeft: 8, fontSize: 12 }}>{p.code}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 600, color: 'var(--accent)' }}>{formatCurrency(p.salePrice)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tồn: {p.stock} {p.unit}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Cart Items */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {cart.length === 0 ? (
            <div className="card" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="empty-state">
                <ShoppingCart />
                <h3>Chưa có sản phẩm</h3>
                <p>Tìm và thêm sản phẩm vào đơn hàng</p>
              </div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 30 }}>#</th>
                    <th>Sản phẩm</th>
                    <th style={{ width: 120 }}>Đơn giá</th>
                    <th style={{ width: 120 }}>Số lượng</th>
                    <th style={{ width: 110 }}>Tiền</th>
                    <th style={{ width: 90 }}>Giảm</th>
                    <th className="text-right" style={{ width: 110 }}>Thành tiền</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item, i) => {
                    const lineTotal = item.quantity * item.unitPrice - item.discount;
                    return (
                      <tr key={item.productId}>
                        <td className="text-muted">{i + 1}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{item.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tồn: {item.stock} {item.unit}</div>
                        </td>
                        <td>
                          <input className="form-input" type="number" min="0" value={item.unitPrice} onChange={(e) => updateCartField(item.productId, 'unitPrice', parseFloat(e.target.value) || 0)} style={{ textAlign: 'right' }} />
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => updateQty(item.productId, -1)} style={{ padding: 4 }}><Minus size={14} /></button>
                            <input className="form-input" type="number" min="0.01" step="any" value={item.quantity} onChange={(e) => updateCartField(item.productId, 'quantity', parseFloat(e.target.value) || 0.01)} style={{ textAlign: 'center', width: 55 }} />
                            <button className="btn btn-ghost btn-sm" onClick={() => updateQty(item.productId, 1)} style={{ padding: 4 }}><Plus size={14} /></button>
                          </div>
                        </td>
                        <td>
                          <input className="form-input" type="number" min="0" step="1000" placeholder="VD: 30000" value={Math.round(item.quantity * item.unitPrice) || ''} onChange={(e) => { const amount = parseFloat(e.target.value) || 0; if (item.unitPrice > 0) { updateCartField(item.productId, 'quantity', Math.round((amount / item.unitPrice) / 0.005) * 0.005); } }} style={{ textAlign: 'right', fontSize: 12 }} />
                        </td>
                        <td>
                          <input className="form-input" type="number" min="0" value={item.discount} onChange={(e) => updateCartField(item.productId, 'discount', parseFloat(e.target.value) || 0)} style={{ textAlign: 'right' }} />
                        </td>
                        <td className="text-right" style={{ fontWeight: 700 }}>{formatCurrency(lineTotal)}</td>
                        <td><button className="btn btn-ghost btn-sm" onClick={() => removeFromCart(item.productId)}><Trash2 size={14} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Summary Panel */}
      <div style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Customer */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>
              <User size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
              Khách hàng
            </span>
            {selectedCustomer && (
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedCustomer(null)} style={{ fontSize: 11 }}>Bỏ chọn</button>
            )}
          </div>
          {selectedCustomer ? (
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 10 }}>
              <div style={{ fontWeight: 600 }}>{selectedCustomer.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedCustomer.phone || 'Không có SĐT'}</div>
              {selectedCustomer.debt > 0 && (
                <div style={{ fontSize: 12, color: 'var(--warning)', marginTop: 4 }}>Nợ cũ: {formatCurrency(selectedCustomer.debt)}</div>
              )}
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <input className="form-input" placeholder="Tìm khách (tên/SĐT)..." value={searchCustomer}
                onChange={(e) => {
                  setSearchCustomer(e.target.value);
                  setShowCustomerSearch(true);
                  setShowQuickCustomerForm(false);
                }}
                onFocus={() => setShowCustomerSearch(true)}
              />
              {!trimmedCustomerSearch && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Bỏ trống = khách lẻ</div>
              )}
              {showCustomerSearch && filteredCustomers.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', zIndex: 10, maxHeight: 150, overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
                  {filteredCustomers.map((c) => (
                    <div key={c.id} onClick={() => { setSelectedCustomer(c); setSearchCustomer(''); setShowCustomerSearch(false); }}
                      style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }}
                      className="nav-item">
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: 11 }}>{c.phone || ''} {c.debt > 0 ? `• Nợ: ${formatCurrency(c.debt)}` : ''}</div>
                    </div>
                  ))}
                </div>
              )}
              {showCustomerNotFound && !showQuickCustomerForm && (
                <div className="customer-not-found">
                  <div className="customer-not-found-text">
                    <AlertCircle size={15} />
                    <span>Không tìm thấy khách hàng</span>
                  </div>
                  <button className="btn btn-primary btn-sm w-full" type="button" onClick={openQuickCustomerForm}>
                    <UserPlus size={14} /> Thêm khách hàng mới
                  </button>
                </div>
              )}
              {showCustomerNotFound && showQuickCustomerForm && (
                <div className="quick-customer-form">
                  <div className="quick-customer-title">
                    <UserPlus size={15} />
                    <span>Thêm khách hàng mới</span>
                  </div>
                  <input
                    className="form-input"
                    placeholder="Tên khách hàng"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    autoFocus
                  />
                  <input
                    className="form-input"
                    placeholder="Số điện thoại (không bắt buộc)"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                  />
                  <div className="quick-customer-actions">
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => setShowQuickCustomerForm(false)} disabled={addingCustomer}>
                      Hủy
                    </button>
                    <button className="btn btn-primary btn-sm" type="button" onClick={createQuickCustomer} disabled={addingCustomer}>
                      {addingCustomer ? 'Đang lưu...' : 'Lưu khách'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Delivery Employee */}
        <div className="card" style={{ padding: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>
            <Truck size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
            Nhân viên giao
          </span>
          <select className="form-select" style={{ marginTop: 8 }} value={deliveryEmployeeId} onChange={(e) => setDeliveryEmployeeId(e.target.value)}>
            <option value="">Không giao hàng</option>
            {employeesList.map((e) => <option key={e.id} value={e.id}>{e.code} - {e.name}</option>)}
          </select>
        </div>

        {/* Payment Summary */}
        <div className="card" style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span className="text-muted">Tạm tính ({cart.length} SP):</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label className="form-label">Giảm giá toàn đơn</label>
              <input className="form-input" type="number" min="0" value={orderDiscount} onChange={(e) => setOrderDiscount(e.target.value)} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', marginBottom: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>TỔNG CỘNG:</span>
              <span style={{ fontWeight: 800, fontSize: 20, color: 'var(--accent)' }}>{formatCurrency(totalAmount)}</span>
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Phương thức thanh toán</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className={`btn ${paymentMethod === 'cash' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setPaymentMethod('cash')}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  type="button"
                >
                  <Banknote size={16} /> Tiền mặt
                </button>
                <button
                  className={`btn ${paymentMethod === 'transfer' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setPaymentMethod('transfer')}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  type="button"
                >
                  <CreditCard size={16} /> Chuyển khoản
                </button>
              </div>
            </div>
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Tiền khách trả</label>
                <button className="btn btn-ghost btn-sm" onClick={payFull} style={{ fontSize: 11 }}>Trả đủ</button>
              </div>
              <input className="form-input" type="number" min="0" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder="0" style={{ fontSize: 16, fontWeight: 600, marginTop: 6 }} />
            </div>
            {debtAmount > 0 && (
              <div style={{ background: 'var(--warning-bg)', padding: '8px 12px', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'var(--warning)', fontWeight: 600 }}>Còn nợ:</span>
                <span style={{ color: 'var(--warning)', fontWeight: 700 }}>{formatCurrency(debtAmount)}</span>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Ghi chú</label>
              <input className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="..." />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={() => handleSubmit('pending')} disabled={cart.length === 0 || submitting} style={{ flex: 1, border: '1px solid var(--border-color)' }}>
              ⏳ Lưu chờ
            </button>
            <button className="btn btn-success btn-lg" onClick={() => handleSubmit()} disabled={cart.length === 0 || submitting} style={{ flex: 2 }}>
              <ShoppingCart size={18} /> {submitting ? 'Đang xử lý...' : 'Thanh toán'}
            </button>
          </div>

{invoiceData && (
  <button
    className="btn btn-ghost w-full"
    onClick={() => setShowInvoice(true)}
    style={{ marginTop: 8, borderColor: 'var(--accent)', color: 'var(--accent)' }}
  >
    🧾 Xuất hóa đơn
  </button>
)}
{invoiceData && (
  <button
    className="btn btn-ghost w-full"
    onClick={async () => {
      const text = [
        invoiceData.customerName || 'Khách lẻ',
        invoiceData.customerPhone || '',
        ...invoiceData.items.map((i: any) =>
          `${i.quantity} ${i.unit} ${i.name} ${new Intl.NumberFormat('vi-VN').format(i.totalPrice)}`
        ),
        `Tổng ${new Intl.NumberFormat('vi-VN').format(invoiceData.totalAmount)}`,
      ].filter(Boolean).join('\n');
      try {
        await navigator.clipboard.writeText(text);
        showToast('success', '📋 Đã copy hóa đơn!');
      } catch {
        showToast('error', 'Không thể copy');
      }
    }}
    style={{ marginTop: 8 }}
  >
    📋 Tạo hóa đơn
  </button>
)}
        </div>
      </div>
    </div>
    </>
  );
}

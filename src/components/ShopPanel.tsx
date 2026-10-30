import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, Minus, Plus, Search, ShoppingCart, X, CreditCard, MapPin, Package } from 'lucide-react';
import { apiFetch } from '../utils/api';
import type { AdminPaymentSettings, OrderAddress, OrderItem, Product, User } from '../types';

type CartLine = OrderItem & { variants?: { name: string; options: string[] }[] };
type CheckoutAddress = OrderAddress & { street: string; building_number: string; landmark: string; line1: string; line2: string; pincode: string };

const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value || 0);
const variantsFor = (product: Product) => Array.isArray(product.variants) ? product.variants.filter((v: any) => v && typeof v === 'object' && v.name && Array.isArray(v.options)) as { name: string; options: string[] }[] : [];

interface Props { currentUser: User | null; isCashierMode?: boolean; onRequestLogin: () => void; }
export const ShopPanel: React.FC<Props> = ({ currentUser, isCashierMode = false, onRequestLogin }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [checkoutItems, setCheckoutItems] = useState<CartLine[] | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<1 | 2>(1);
  const [address, setAddress] = useState<CheckoutAddress>({ street: '', building_number: '', landmark: '', line1: '', line2: '', pincode: '' });
  const [email, setEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'ONLINE'>('COD');
  const [paymentOption, setPaymentOption] = useState<'QR_CODE' | 'UPI_ID' | 'PHONE' | ''>('');
  const [paymentSettings, setPaymentSettings] = useState<AdminPaymentSettings>({ qr_code_url: '', phone_number: '', upi_id: '' });
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [orderPaymentPending, setOrderPaymentPending] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [error, setError] = useState('');

  const loadStore = async () => {
    setLoading(true);
    setError('');
    try {
      const [productsResponse, settingsResponse] = await Promise.all([
        apiFetch('/api/products'),
        apiFetch('/api/admin/payment-settings').catch(() => null),
      ]);
      if (!productsResponse.ok) throw new Error('Unable to load the store right now. Please try again.');
      const productData: any = await productsResponse.json().catch(() => ({}));
      const rawProducts = Array.isArray(productData) ? productData : Array.isArray(productData?.products) ? productData.products : [];
      const normalizedProducts: Product[] = rawProducts.filter((item: any) => item && typeof item === 'object').map((item: any) => {
        const parseArray = (value: any): any[] => {
          if (Array.isArray(value)) return value;
          if (typeof value === 'string') { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
          return [];
        };
        return {
          ...item,
          id: String(item.id ?? ''),
          title: String(item.title ?? item.name ?? 'Untitled product'),
          description: typeof item.description === 'string' ? item.description : '',
          price: Number.isFinite(Number(item.price)) ? Number(item.price) : 0,
          compare_price: Number.isFinite(Number(item.compare_price)) ? Number(item.compare_price) : 0,
          stock: Number.isFinite(Number(item.stock)) ? Math.max(0, Number(item.stock)) : 0,
          media: parseArray(item.media).filter((url: unknown) => typeof url === 'string' && url.length > 0),
          variants: parseArray(item.variants),
          is_published: item.is_published === true || String(item.is_published).toLowerCase() === 'true' || item.is_published === undefined,
        } as Product;
      });
      setProducts(normalizedProducts);
      if (settingsResponse?.ok) {
        const settingsData: any = await settingsResponse.json().catch(() => ({}));
        setPaymentSettings({ qr_code_url: settingsData?.qr_code_url || '', phone_number: settingsData?.phone_number || '', upi_id: settingsData?.upi_id || '' });
      }
    } catch (e: any) {
      setProducts([]);
      setError(e?.message || 'Unable to load the store. Please try again.');
    } finally { setLoading(false); }
  };
  useEffect(() => { void loadStore(); }, []);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (Array.isArray(products) ? products : []).filter(p => p && p.is_published !== false && (!term || `${p.title || ''} ${p.description || ''}`.toLowerCase().includes(term)));
  }, [products, search]);
  const cartCount = cart.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const cartSubtotal = cart.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);
  const checkoutSubtotal = (checkoutItems || []).reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);
  const grandTotal = checkoutSubtotal + (paymentMethod === 'COD' ? 20 : 0);
  const discount = (p: Product) => Number(p?.compare_price) > Number(p?.price) && Number(p.compare_price) > 0 ? Math.round((1 - Number(p.price) / Number(p.compare_price)) * 100) : 0;

  const addLine = (product: Product, qty: number, variantMap: Record<string, string>) => {
    const variant = Object.entries(variantMap).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join(', ');
    const key = `${product.id}::${variant}`;
    const stock = Number(product.stock ?? 0);
    const currentProductQuantity = cart.filter(item => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
    if (currentProductQuantity + qty > stock) {
      setError(`Only ${stock} unit(s) are available for ${product.title}.`);
      return;
    }
    setError('');
    setCart(old => {
      const existing = old.find(item => `${item.productId}::${item.variant || ''}` === key);
      if (existing) return old.map(item => `${item.productId}::${item.variant || ''}` === key ? { ...item, quantity: item.quantity + qty } : item);
      return [...old, { productId: product.id, title: product.title, price: Number(product.price), quantity: qty, variant, image: product.media?.[0] || '', variants: variantsFor(product) }];
    });
  };
  const beginCheckout = (items: CartLine[]) => {
    if (!currentUser?.mobile) { onRequestLogin(); return; }
    setCheckoutItems(items);
    setCheckoutStep(1);
    setPaymentMethod('COD');
    setPaymentOption('');
    setCartOpen(false);
    setSelected(null);
    setError('');
  };
  const updateCartQty = (index: number, delta: number) => {
    const target = cart[index];
    if (!target) return;
    if (delta > 0) {
      const product = products.find(p => p.id === target.productId);
      const stock = Number(product?.stock ?? 0);
      const currentProductQuantity = cart.filter(item => item.productId === target.productId).reduce((sum, item) => sum + item.quantity, 0);
      if (currentProductQuantity + delta > stock) {
        setError(`Only ${stock} unit(s) are available for ${target.title}.`);
        return;
      }
    }
    setError('');
    setCart(old => old.map((item, i) => i === index ? { ...item, quantity: item.quantity + delta } : item).filter(item => item.quantity > 0));
  };
  const placeOrder = async () => {
    if (!currentUser?.mobile) { onRequestLogin(); return; }
    if (!checkoutItems?.length) return;
    if (paymentMethod === 'ONLINE' && !paymentOption) { setError('Select an online payment method to continue.'); return; }
    if (paymentMethod === 'ONLINE' && paymentOption === 'QR_CODE' && !paymentSettings.qr_code_url) { setError('Online QR payment is not configured by the store administrator.'); return; }
    if (paymentMethod === 'ONLINE' && paymentOption === 'UPI_ID' && !paymentSettings.upi_id) { setError('UPI payment is not configured by the store administrator.'); return; }
    if (paymentMethod === 'ONLINE' && paymentOption === 'PHONE' && !paymentSettings.phone_number) { setError('Phone payment is not configured by the store administrator.'); return; }
    setPlacingOrder(true); setError('');
    try {
      const response = await apiFetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer_name: currentUser.name || 'Customer', customer_mobile: currentUser.mobile, customer_email: email.trim(), address, items: checkoutItems.map(({ variants: _variants, ...item }) => item), payment_method: paymentMethod, payment_sub_option: paymentMethod === 'ONLINE' ? paymentOption : null }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to place your order.');
      setOrderId(data.order?.id || '');
      setOrderPaymentPending(String(data.order?.payment_status || '').toUpperCase() === 'PENDING');
      setOrderConfirmed(true); setCheckoutItems(null); setCart([]);
    } catch (e: any) { setError(e.message || 'Unable to place your order.'); }
    finally { setPlacingOrder(false); }
  };

  if (orderConfirmed) return <div className="fixed inset-0 z-[100] bg-white flex items-center justify-center p-5"><div className="max-w-lg w-full text-center bg-white rounded-3xl border border-slate-200 shadow-xl p-8 sm:p-12"><CheckCircle2 className={`w-24 h-24 mx-auto mb-5 ${orderPaymentPending ? 'text-amber-500' : 'text-green-500'}`} /><p className="text-xs uppercase tracking-[0.2em] font-bold text-slate-500 mb-2">Step 3 of 3</p><h1 className="text-2xl sm:text-3xl font-black text-slate-900">{orderPaymentPending ? 'Order Received — Payment Pending' : 'Your Order is Confirmed!'}</h1><p className="mt-3 text-slate-600">{orderPaymentPending ? 'Your order is saved, but online payment has not been verified by this app. The store must verify payment before confirming dispatch.' : 'Delivered within 7 days.'}</p>{orderId && <p className="mt-4 text-sm text-slate-500">Order ID: <strong className="text-slate-800">{orderId}</strong></p>}<button onClick={() => { setOrderConfirmed(false); setOrderPaymentPending(false); void loadStore(); }} className="mt-7 rounded-xl bg-blue-600 text-white font-bold px-6 py-3">Continue Shopping</button></div></div>;

  return <div className="space-y-5 pb-8">
    <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-md pt-2 pb-3 space-y-3">
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.2em] font-bold text-blue-600">Official Store</p><h1 className="text-2xl font-black text-slate-900">Cotrix Store</h1></div>{!isCashierMode && <button onClick={() => setCartOpen(true)} aria-label="Open shopping cart" className="relative shrink-0 rounded-2xl bg-white border border-slate-200 p-3 shadow-sm text-slate-800"><ShoppingCart className="w-5 h-5" />{cartCount > 0 && <span className="absolute -right-2 -top-2 min-w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center px-1">{cartCount}</span>}</button>}</div>
      <label className="flex items-center gap-2 rounded-2xl bg-white border border-slate-200 px-4 py-3 shadow-sm"><Search className="w-4 h-4 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..." aria-label="Search products" className="w-full outline-none text-sm text-slate-800 placeholder:text-slate-400 bg-transparent" /></label>
    </div>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}<button onClick={() => setError('')} className="ml-3 font-bold underline">Dismiss</button></div>}
    {loading ? <div className="py-16 text-center text-slate-500">Loading products...</div> : filteredProducts.length === 0 ? <div className="py-16 text-center rounded-3xl border border-dashed border-slate-300 bg-white"><Package className="w-10 h-10 mx-auto text-slate-300 mb-3" /><p className="font-bold text-slate-700">No products found</p><p className="text-sm text-slate-500 mt-1">Try another search or check back later.</p></div> : <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">{filteredProducts.map(p => { const media = p.media || []; const first = media[0] || ''; return <button key={p.id} onClick={() => { setSelected(p); setQuantity(1); setSelectedVariants({}); setError(''); }} className="text-left rounded-2xl sm:rounded-3xl overflow-hidden bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow"><div className="relative aspect-square bg-slate-100 flex items-center justify-center">{first ? (first.match(/\.(mp4|webm|mov)(\?|$)/i) ? <video src={first} className="w-full h-full object-cover" muted playsInline /> : <img src={first} alt={p.title} loading="lazy" className="w-full h-full object-cover" />) : <Package className="w-10 h-10 text-slate-300" />}{discount(p) > 0 && <span className="absolute left-2 top-2 rounded-lg bg-rose-600 px-2 py-1 text-[10px] font-black text-white">{discount(p)}% OFF</span>}</div><div className="p-3 sm:p-4"><h2 className="font-bold text-sm text-slate-900 line-clamp-2 min-h-10">{p.title}</h2><div className="mt-2 flex flex-wrap items-baseline gap-2"><span className="font-black text-blue-700">{money(Number(p.price))}</span>{Number(p.compare_price) > Number(p.price) && <span className="text-xs text-slate-400 line-through">{money(Number(p.compare_price))}</span>}</div><span className={`mt-1 block text-[11px] font-bold ${(p.stock ?? 0) > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{(p.stock ?? 0) > 0 ? `${p.stock ?? 0} in stock` : 'Out of stock'}</span><span className="mt-2 inline-flex text-xs font-bold text-blue-700">View Product →</span></div></button>; })}</div>}

    {selected && <div className="fixed inset-0 z-[70] bg-slate-950/60 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setSelected(null)}><div onClick={e => e.stopPropagation()} className="w-full max-w-xl max-h-[92dvh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl"><div className="flex items-center justify-between p-4 border-b border-slate-100"><h2 className="font-black text-lg">Product Details</h2><button onClick={() => setSelected(null)} aria-label="Close product details" className="p-2 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button></div><div className="p-4 sm:p-6 space-y-4">{selected.media?.length ? <div className="flex gap-3 overflow-x-auto">{selected.media.map((url, i) => url.match(/\.(mp4|webm|mov)(\?|$)/i) ? <video key={url + i} src={url} controls className="h-56 min-w-[75%] rounded-2xl bg-slate-100 object-contain" /> : <img key={url + i} src={url} alt={`${selected.title} ${i + 1}`} className="h-56 min-w-[75%] rounded-2xl bg-slate-100 object-contain" />)}</div> : <div className="h-40 rounded-2xl bg-slate-100 flex items-center justify-center"><Package className="w-10 h-10 text-slate-300" /></div>}<h3 className="text-xl font-black text-slate-900">{selected.title}</h3><p className={`text-xs font-bold ${(selected.stock ?? 0) > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{(selected.stock ?? 0) > 0 ? `${selected.stock ?? 0} units available` : 'Currently out of stock'}</p><div className="flex items-center gap-3"><span className="text-xl font-black text-blue-700">{money(Number(selected.price))}</span>{Number(selected.compare_price) > Number(selected.price) && <><span className="text-sm text-slate-400 line-through">{money(Number(selected.compare_price))}</span><span className="rounded-lg bg-rose-50 text-rose-700 px-2 py-1 text-xs font-black">{discount(selected)}% OFF</span></>}</div>{selected.description && <p className="text-sm leading-6 text-slate-600 whitespace-pre-wrap">{selected.description}</p>}{variantsFor(selected).map(v => <label key={v.name} className="block"><span className="block text-sm font-bold text-slate-700 mb-2">{v.name}</span><select value={selectedVariants[v.name] || ''} onChange={e => { setSelectedVariants(old => ({ ...old, [v.name]: e.target.value })); setError(''); }} className="w-full rounded-xl border border-slate-300 p-3 text-sm"><option value="">Select {v.name}</option>{v.options.map(option => <option key={option} value={option}>{option}</option>)}</select></label>)}<div className="flex items-center justify-between"><span className="font-bold text-slate-700">Quantity</span><div className="flex items-center gap-4 rounded-xl border border-slate-200 p-1"><button aria-label="Decrease quantity" onClick={() => setQuantity(q => Math.max(1, q - 1))} className="p-2 rounded-lg hover:bg-slate-100"><Minus className="w-4 h-4" /></button><span className="font-black min-w-4 text-center">{quantity}</span><button aria-label="Increase quantity" disabled={quantity >= Math.min(99, Number(selected.stock ?? 0))} onClick={() => setQuantity(q => Math.min(99, Number(selected.stock ?? 0), q + 1))} className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-40"><Plus className="w-4 h-4" /></button></div></div>{error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{isCashierMode ? <div className="sm:col-span-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-bold text-blue-800">Order in Owner Panel</div> : <><button disabled={Number(selected.stock ?? 0) < 1 || quantity > Number(selected.stock ?? 0)} onClick={() => { if (variantsFor(selected).some(v => !selectedVariants[v.name])) { setError('Select an option for every product variant.'); return; } addLine(selected, quantity, selectedVariants); setSelected(null); }} className="rounded-xl border border-blue-600 text-blue-700 py-3 font-bold disabled:opacity-40">Add to Cart</button><button disabled={Number(selected.stock ?? 0) < 1 || quantity > Number(selected.stock ?? 0)} onClick={() => { if (variantsFor(selected).some(v => !selectedVariants[v.name])) { setError('Select an option for every product variant.'); return; } beginCheckout([{ productId: selected.id, title: selected.title, price: Number(selected.price), quantity, variant: Object.entries(selectedVariants).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join(', '), image: selected.media?.[0] || '' }]); }} className="rounded-xl bg-blue-600 text-white py-3 font-bold disabled:opacity-40">Buy Now</button></>}</div></div></div></div>}

    {cartOpen && <div className="fixed inset-0 z-[70] bg-slate-950/50 flex justify-end" onClick={() => setCartOpen(false)}><aside onClick={e => e.stopPropagation()} className="w-full max-w-md h-full bg-white shadow-2xl flex flex-col"><div className="p-5 border-b border-slate-200 flex items-center justify-between"><div><h2 className="text-xl font-black">Your Cart</h2><p className="text-xs text-slate-500 mt-1">{cartCount} item(s)</p></div><button onClick={() => setCartOpen(false)} aria-label="Close cart" className="p-2 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button></div><div className="flex-1 overflow-y-auto p-4 space-y-4">{cart.length === 0 ? <p className="py-12 text-center text-slate-500">Your cart is empty.</p> : cart.map((item, index) => <div key={`${item.productId}-${item.variant}-${index}`} className="flex gap-3 border-b border-slate-100 pb-4">{item.image ? <img src={item.image} alt={item.title} className="w-20 h-20 rounded-xl object-cover bg-slate-100" /> : <div className="w-20 h-20 rounded-xl bg-slate-100 flex items-center justify-center"><Package className="w-6 h-6 text-slate-300" /></div>}<div className="flex-1 min-w-0"><p className="font-bold text-sm text-slate-900">{item.title}</p>{item.variant && <p className="text-xs text-slate-500 mt-1">{item.variant}</p>}<p className="font-black text-blue-700 mt-1">{money(item.price * item.quantity)}</p><div className="flex items-center gap-3 mt-2"><button onClick={() => updateCartQty(index, -1)} className="border rounded-lg p-1.5"><Minus className="w-3 h-3" /></button><span className="text-sm font-bold">{item.quantity}</span><button onClick={() => updateCartQty(index, 1)} className="border rounded-lg p-1.5"><Plus className="w-3 h-3" /></button></div></div></div>)}</div><div className="border-t border-slate-200 p-5 space-y-3"><div className="flex justify-between text-sm"><span>Subtotal</span><strong>{money(cartSubtotal)}</strong></div><div className="flex justify-between text-sm text-slate-500"><span>COD handling fee</span><span>Added at checkout</span></div><div className="flex justify-between text-lg font-black"><span>Subtotal</span><span>{money(cartSubtotal)}</span></div><button disabled={!cart.length} onClick={() => beginCheckout(cart)} className="w-full rounded-xl bg-blue-600 text-white py-3 font-bold disabled:opacity-40">Checkout</button></div></aside></div>}

    {checkoutItems && <div className="fixed inset-0 z-[80] bg-slate-950/60 flex items-end sm:items-center justify-center sm:p-4"><div className="w-full max-w-lg max-h-[95dvh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl"><div className="p-5 border-b border-slate-100 flex items-center justify-between"><div><p className="text-xs uppercase tracking-wider text-blue-600 font-bold">Checkout · Step {checkoutStep} of 2</p><h2 className="text-xl font-black mt-1">{checkoutStep === 1 ? 'Delivery Address' : 'Payment Method'}</h2></div><button onClick={() => setCheckoutItems(null)} aria-label="Close checkout" className="p-2 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button></div><div className="p-5 space-y-4">{error && <div role="alert" className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 p-3 text-sm">{error}</div>}{checkoutStep === 1 ? <><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{([['street','Street'],['building_number','Building Number'],['landmark','Landmark'],['pincode','PIN Code']] as [keyof CheckoutAddress,string][]).map(([key,label]) => <label key={key} className="block"><span className="text-xs font-bold text-slate-700">{label}</span><input value={address[key] || ''} onChange={e => setAddress(old => ({ ...old, [key]: e.target.value }))} required={key !== 'landmark'} className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm" /></label>)}</div><label className="block"><span className="text-xs font-bold text-slate-700">Full Address Line 1</span><input required value={address.line1} onChange={e => setAddress(old => ({ ...old, line1: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm" /></label><label className="block"><span className="text-xs font-bold text-slate-700">Full Address Line 2</span><input value={address.line2} onChange={e => setAddress(old => ({ ...old, line2: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm" /></label><label className="block"><span className="text-xs font-bold text-slate-700">Email Address (Optional)</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm" /></label><button onClick={() => { if (!address.street.trim() || !address.building_number.trim() || !address.line1.trim() || !/^\d{6}$/.test(address.pincode.trim())) { setError('Enter Street, Building Number, Full Address Line 1, and a valid 6-digit PIN Code.'); return; } setError(''); setCheckoutStep(2); }} className="w-full rounded-xl bg-blue-600 text-white py-3 font-bold">Next</button></> : <><div className="space-y-3"><button onClick={() => { setPaymentMethod('COD'); setPaymentOption(''); }} className={`w-full text-left p-4 rounded-2xl border ${paymentMethod === 'COD' ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}><span className="font-bold">Cash on Delivery (COD)</span><span className="block text-xs text-slate-500 mt-1">Includes a ₹20 handling fee.</span></button><button onClick={() => setPaymentMethod('ONLINE')} className={`w-full text-left p-4 rounded-2xl border ${paymentMethod === 'ONLINE' ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}><span className="font-bold">Online Payment</span><span className="block text-xs text-slate-500 mt-1">Choose a payment method configured by the store.</span></button></div>{paymentMethod === 'ONLINE' && <div className="space-y-3">{([['QR_CODE','Pay by QR Code',!!paymentSettings.qr_code_url],['UPI_ID','Pay by UPI ID',!!paymentSettings.upi_id],['PHONE','Pay by Phone Number',!!paymentSettings.phone_number]] as [typeof paymentOption,string,boolean][]).map(([value,label,available]) => <button key={value} disabled={!available} onClick={() => setPaymentOption(value)} className={`w-full p-3 rounded-xl border text-left text-sm font-bold disabled:opacity-40 ${paymentOption === value ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}>{label}{!available && <span className="block text-xs font-normal text-slate-500 mt-1">Not configured</span>}</button>)}{paymentOption === 'QR_CODE' && paymentSettings.qr_code_url && <img src={paymentSettings.qr_code_url} alt="Store payment QR code" className="w-48 h-48 object-contain mx-auto border rounded-xl p-2" />}{paymentOption === 'UPI_ID' && <p className="text-center font-black text-blue-700 select-all">{paymentSettings.upi_id}</p>}{paymentOption === 'PHONE' && <p className="text-center font-black text-blue-700 select-all">{paymentSettings.phone_number}</p>}<p className="text-xs text-slate-500">After reviewing the payment details, continue to submit your order. Payment is not automatically verified by this app.</p></div>}<div className="rounded-2xl bg-slate-50 p-4 space-y-2"><div className="flex justify-between text-sm"><span>Items total</span><span>{money(checkoutSubtotal)}</span></div>{paymentMethod === 'COD' && <div className="flex justify-between text-sm"><span>COD handling fee</span><span>{money(20)}</span></div>}<div className="border-t pt-2 flex justify-between font-black"><span>Total</span><span>{money(grandTotal)}</span></div></div><div className="flex gap-3"><button onClick={() => { setError(''); setCheckoutStep(1); }} className="flex-1 rounded-xl border border-slate-300 py-3 font-bold">Back</button><button disabled={placingOrder} onClick={() => void placeOrder()} className="flex-1 rounded-xl bg-blue-600 text-white py-3 font-bold disabled:opacity-50">{placingOrder ? 'Placing Order...' : 'Confirm Order'}</button></div></>}</div></div></div>}
  </div>;
};

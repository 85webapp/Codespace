import { IndianAmountInput } from './IndianAmountInput';
import { apiFetch } from '../utils/api';
import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  ShieldCheck,
  Users,
  Store,
  Package,
  Search,
  RefreshCw,
  KeyRound,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  DollarSign,
  QrCode,
  Phone,
  Upload,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Receipt,
  Wallet,
  Calendar,
  Check,
  ShieldAlert,
  Unlock,
  Ban,
} from 'lucide-react';
import { User as UserType, Product, Order, AdminPaymentSettings } from '../types';
import { formatCurrency } from '../utils/formatters';

interface Props {
  isOpen: boolean;
  adminUser: UserType | null;
  onClose: () => void;
  onSelectCustomerToView?: (customer: any) => void;
}

type AdminTab = 'home' | 'store' | 'orders';

export const AdminPortalModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('home');

  // Customer Management (Home Tab) State
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [expandedCustomerMobile, setExpandedCustomerMobile] = useState<string | null>(null);
  const [showLockedDevices, setShowLockedDevices] = useState(false);
  const [lockedDevices, setLockedDevices] = useState<any[]>([]);
  const [loadingLockedDevices, setLoadingLockedDevices] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Password Reset Modal State
  const [resetTarget, setResetTarget] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // Add Wallet Modal State
  const [walletTarget, setWalletTarget] = useState<any>(null);
  const [walletTxType, setWalletTxType] = useState<'PAYMENT_IN' | 'PAYMENT_OUT' | 'ADD_DUE'>('PAYMENT_IN');
  const [walletAmount, setWalletAmount] = useState('');
  const [walletNotes, setWalletNotes] = useState('');
  const [walletLoading, setWalletLoading] = useState(false);

  // Set Fee Modal State
  const [feeTarget, setFeeTarget] = useState<any>(null);
  const [monthlyFeeInput, setMonthlyFeeInput] = useState('');
  const [feeLoading, setFeeLoading] = useState(false);

  // Store Management (Store Tab) State
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({
    title: '',
    description: '',
    price: '',
    compare_price: '',
    mediaUrl: '',
    variantsText: '',
    stock: '0',
    is_published: true,
  });

  // Admin Payment Settings State
  const [paymentSettings, setPaymentSettings] = useState<AdminPaymentSettings>({
    qr_code_url: '',
    phone_number: '',
    upi_id: '',
  });
  const [savingPaymentSettings, setSavingPaymentSettings] = useState(false);
  const [editingPaymentSettings, setEditingPaymentSettings] = useState(true);
  const [hasSavedPaymentDetails, setHasSavedPaymentDetails] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [productMediaItems, setProductMediaItems] = useState<Array<{ id: string; previewUrl: string; url: string; isVideo: boolean }>>([]);
  const [mediaDragActive, setMediaDragActive] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);

  // Orders Management (Orders Tab) State
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL');
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<Order | null>(null);

  // Shared alerts
  const [globalNotice, setGlobalNotice] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const notifySuccess = (msg: string) => {
    setGlobalNotice(msg);
    setTimeout(() => setGlobalNotice(null), 4500);
  };

  const notifyError = (msg: string) => {
    setGlobalError(msg);
    setTimeout(() => setGlobalError(null), 4500);
  };

  // 1. Load Customers & Wallets
  const loadCustomers = async () => {
    setLoadingCustomers(true);
    try {
      const res = await apiFetch('/api/admin/customers-with-wallets');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load accounts');
      setCustomers(data.customers || []);
    } catch (err: any) {
      notifyError(err.message);
    } finally {
      setLoadingCustomers(false);
    }
  };

  // Load account and device blocks created by account deletion.
  const loadLockedDevices = async () => {
    setLoadingLockedDevices(true);
    try {
      const res = await apiFetch('/api/admin/locked-devices');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load locked devices.');
      setLockedDevices(data.devices || []);
    } catch (err: any) {
      notifyError(err.message || 'Failed to load locked devices.');
    } finally {
      setLoadingLockedDevices(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deleteTarget || deleteConfirmation !== 'DELETE') return;
    setDeleteLoading(true);
    try {
      const res = await apiFetch(`/api/admin/customers/${encodeURIComponent(deleteTarget.mobile)}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'DELETE' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Account deletion failed.');
      notifySuccess(`Account for ${deleteTarget.name} deleted and access blocked.`);
      setDeleteTarget(null);
      setDeleteConfirmation('');
      setExpandedCustomerMobile(null);
      await loadCustomers();
      await loadLockedDevices();
    } catch (err: any) {
      notifyError(err.message || 'Account deletion failed.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleUnlockDevice = async (entry: any) => {
    if (!window.confirm(`Unlock access for ${entry.mobile}? This removes this specific block entry.`)) return;
    try {
      const res = await apiFetch(`/api/admin/locked-devices/${encodeURIComponent(entry.id)}/unlock`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to unlock this entry.');
      notifySuccess(`Access block for ${entry.mobile} removed.`);
      await loadLockedDevices();
    } catch (err: any) {
      notifyError(err.message || 'Unable to unlock this entry.');
    }
  };

  // 2. Load Store Products
  const loadProducts = async () => {
    setLoadingProducts(true);
    try {
      const res = await apiFetch('/api/products?all=true');
      const data = await res.json();
      if (res.ok) {
        setProducts(data.products || []);
      }
    } catch (err: any) {
      console.warn('Failed to load products:', err);
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleQrCodeUpload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { notifyError('Choose an image file for the payment QR code.'); return; }
    setSavingPaymentSettings(true);
    try {
      const sigResponse = await apiFetch('/api/admin/cloudinary-signature', { method: 'POST' });
      const sig = await sigResponse.json();
      if (!sigResponse.ok) throw new Error(sig.error || 'Cloudinary upload is not configured.');
      const form = new FormData();
      form.append('file', file); form.append('api_key', sig.api_key); form.append('timestamp', String(sig.timestamp)); form.append('folder', sig.folder); form.append('signature', sig.signature);
      const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/image/upload`, { method: 'POST', body: form });
      const uploaded = await uploadResponse.json();
      if (!uploadResponse.ok || !uploaded.secure_url) throw new Error(uploaded.error?.message || 'QR code upload failed.');
      setPaymentSettings(old => ({ ...old, qr_code_url: uploaded.secure_url }));
      notifySuccess('Payment QR code uploaded. Save Payment Details to publish it.');
    } catch (err: any) { notifyError(err.message || 'QR code upload failed.'); }
    finally { setSavingPaymentSettings(false); }
  };

  // 3. Load Admin Payment Settings
  const loadPaymentSettings = async () => {
    try {
      const res = await apiFetch('/api/admin/payment-settings');
      const data = await res.json();
      if (res.ok) {
        const nextSettings = {
          qr_code_url: data?.qr_code_url || '',
          phone_number: data?.phone_number || '',
          upi_id: data?.upi_id || '',
        };
        setPaymentSettings(nextSettings);
        const hasSaved = Boolean(nextSettings.qr_code_url || nextSettings.phone_number || nextSettings.upi_id);
        setHasSavedPaymentDetails(hasSaved);
        setEditingPaymentSettings(!hasSaved);
      }
    } catch (err: any) {
      console.warn('Failed to load payment settings:', err);
    }
  };

  // 4. Load Orders
  const loadOrders = async () => {
    setLoadingOrders(true);
    try {
      const res = await apiFetch('/api/orders?admin=true');
      const data = await res.json();
      if (res.ok) {
        setOrders(data.orders || []);
      }
    } catch (err: any) {
      console.warn('Failed to load orders:', err);
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCustomers();
      loadLockedDevices();
      loadProducts();
      loadPaymentSettings();
      loadOrders();
    }
  }, [isOpen]);

  // Execute Password Reset
  const handleSavePasswordReset = async () => {
    if (!resetTarget) return;
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      notifyError('Password must be at least 8 characters and contain letters and numbers.');
      return;
    }
    if (newPassword !== confirmPassword) {
      notifyError('Password and Confirm Password do not match.');
      return;
    }

    setResetLoading(true);
    try {
      const res = await apiFetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mobile: resetTarget.mobile,
          newPassword,
          confirmPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Password reset failed');
      notifySuccess(`Password reset successfully for ${resetTarget.name}. Securely provide the new credentials.`);
      setResetTarget(null);
      setNewPassword('');
      setConfirmPassword('');
      loadCustomers();
    } catch (err: any) {
      notifyError(err.message);
    } finally {
      setResetLoading(false);
    }
  };

  // Execute Wallet Transaction
  const handleSaveWalletTx = async () => {
    if (!walletTarget) return;
    const amount = parseFloat(walletAmount);
    if (isNaN(amount) || amount <= 0) {
      notifyError('Please enter a valid amount greater than 0.');
      return;
    }

    setWalletLoading(true);
    try {
      const res = await apiFetch(`/api/admin/customers/${encodeURIComponent(walletTarget.mobile)}/wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: walletTxType,
          amount,
          notes: walletNotes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update wallet');
      notifySuccess(`Wallet transaction successfully recorded for ${walletTarget.name}.`);
      setWalletTarget(null);
      setWalletAmount('');
      setWalletNotes('');
      loadCustomers();
    } catch (err: any) {
      notifyError(err.message);
    } finally {
      setWalletLoading(false);
    }
  };

  // Execute Set Recurring Monthly Fee
  const handleSaveMonthlyFee = async () => {
    if (!feeTarget) return;
    const fee = parseFloat(monthlyFeeInput);
    if (isNaN(fee) || fee < 0) {
      notifyError('Please enter a valid recurring fee amount (0 or higher).');
      return;
    }

    setFeeLoading(true);
    try {
      const res = await apiFetch(`/api/admin/customers/${encodeURIComponent(feeTarget.mobile)}/fee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthly_fee: fee,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to set monthly fee');
      notifySuccess(`Monthly recurring fee of ₹${fee} set for ${feeTarget.name}. It will automatically apply after 30 days.`);
      setFeeTarget(null);
      setMonthlyFeeInput('');
      loadCustomers();
    } catch (err: any) {
      notifyError(err.message);
    } finally {
      setFeeLoading(false);
    }
  };

  const handleProductMediaUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    const invalidFile = selectedFiles.find((file) => !file.type.startsWith('image/') && !file.type.startsWith('video/'));
    if (invalidFile) { notifyError('Only image and video files are supported.'); return; }

    const pending = selectedFiles.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      isVideo: file.type.startsWith('video/'),
    }));
    setProductMediaItems((old) => [...old, ...pending.map(({ id, previewUrl, isVideo }) => ({ id, previewUrl, url: '', isVideo }))]);
    setUploadingMedia(true);
    try {
      const signatureResponse = await apiFetch('/api/admin/cloudinary-signature', { method: 'POST' });
      const signatureData = await signatureResponse.json();
      if (!signatureResponse.ok) throw new Error(signatureData.error || 'Cloudinary upload is not configured.');
      for (const item of pending) {
        const form = new FormData();
        form.append('file', item.file);
        form.append('api_key', signatureData.api_key);
        form.append('timestamp', String(signatureData.timestamp));
        form.append('folder', signatureData.folder);
        form.append('signature', signatureData.signature);
        const resourceType = item.isVideo ? 'video' : 'image';
        const response = await fetch(`https://api.cloudinary.com/v1_1/${signatureData.cloud_name}/${resourceType}/upload`, { method: 'POST', body: form });
        const result = await response.json();
        if (!response.ok || !result.secure_url) throw new Error(result.error?.message || `Failed to upload ${item.file.name}.`);
        setProductMediaItems((old) => old.map((media) => media.id === item.id ? { ...media, url: result.secure_url, previewUrl: result.secure_url } : media));
        URL.revokeObjectURL(item.previewUrl);
      }
      notifySuccess(`${pending.length} media file(s) uploaded successfully.`);
    } catch (err: any) {
      notifyError(err.message || 'Media upload failed. Remove any item that did not finish uploading and try again.');
    } finally { setUploadingMedia(false); }
  };

  const removeProductMedia = (id: string) => {
    setProductMediaItems((old) => {
      const target = old.find((item) => item.id === id);
      if (target?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(target.previewUrl);
      return old.filter((item) => item.id !== id);
    });
  };

  // Execute Product Save
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = parseFloat(productForm.price);
    if (!productForm.title.trim() || isNaN(priceNum) || priceNum <= 0) {
      notifyError('Product title and a valid price greater than 0 are required.');
      return;
    }

    const mediaUrls = productMediaItems.map((item) => item.url).filter(Boolean);
    if (productForm.is_published && mediaUrls.length === 0) {
      notifyError('Add at least one product photo or video before publishing.');
      return;
    }

    if (productMediaItems.some((item) => !item.url)) {
      notifyError('Wait for all selected media to finish uploading, or remove unfinished items.');
      return;
    }

    setSavingProduct(true);
    try {
      const payload = {
        title: productForm.title.trim(),
        description: productForm.description.trim(),
        price: priceNum,
        compare_price: parseFloat(productForm.compare_price) || 0,
        stock: Number.parseInt(productForm.stock || '0', 10),
        media: mediaUrls,
        variants: productForm.variantsText.split('\n').map((line) => { const index = line.indexOf(':'); if (index < 1) return null; return { name: line.slice(0, index).trim(), options: line.slice(index + 1).split(',').map((value) => value.trim()).filter(Boolean) }; }).filter((variant) => variant && variant.name && variant.options.length),
        is_published: productForm.is_published,
      };

      if (editingProduct) {
        const res = await apiFetch(`/api/products/${editingProduct.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to update product.');
        notifySuccess(`Product "${payload.title}" updated successfully.`);
      } else {
        const res = await apiFetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to create product.');
        notifySuccess(`Product "${payload.title}" created successfully.`);
      }

      setIsProductModalOpen(false);
      setEditingProduct(null);
      productMediaItems.forEach((item) => { if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl); });
      setProductMediaItems([]);
      setProductForm({
        title: '',
        description: '',
        price: '',
        compare_price: '',
        mediaUrl: '',
        variantsText: '',
        stock: '0',
        is_published: true,
      });
      loadProducts();
    } catch (err: any) {
      notifyError(err.message || 'Unable to save product.');
    } finally {
      setSavingProduct(false);
    }
  };

  // Delete Product
  const handleDeleteProduct = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete product "${title}"?`)) return;
    try {
      const res = await apiFetch(`/api/products/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete product.');
      notifySuccess(`Product "${title}" removed.`);
      loadProducts();
    } catch (err: any) {
      notifyError(err.message);
    }
  };

  // Save Admin Payment Settings
  const handleSavePaymentSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPaymentSettings(true);
    try {
      const res = await apiFetch('/api/admin/payment-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentSettings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save payment settings.');
      if (data.payment_settings) {
        const savedSettings = {
          qr_code_url: data.payment_settings.qr_code_url || '',
          phone_number: data.payment_settings.phone_number || '',
          upi_id: data.payment_settings.upi_id || '',
        };
        setPaymentSettings(savedSettings);
        setHasSavedPaymentDetails(Boolean(savedSettings.qr_code_url || savedSettings.phone_number || savedSettings.upi_id));
      }
      setEditingPaymentSettings(false);
      notifySuccess('Customer checkout payment options saved successfully.');
    } catch (err: any) {
      notifyError(err.message);
    } finally {
      setSavingPaymentSettings(false);
    }
  };

  // Online QR/UPI payments are marked verified only after the administrator checks the bank/UPI record.
  const handleVerifyOrderPayment = async (orderId: string) => {
    const payment_reference = window.prompt('Enter the verified UTR / UPI transaction reference after checking your bank or UPI app:');
    if (!payment_reference || payment_reference.trim().length < 3) return;
    try {
      const res = await apiFetch(`/api/admin/orders/${orderId}/verify-payment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payment_reference: payment_reference.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to verify payment.');
      notifySuccess(`Payment for order ${orderId} marked verified.`);
      await loadOrders();
    } catch (err: any) { notifyError(err.message || 'Unable to verify payment.'); }
  };

  // Update Order Status
  const handleUpdateOrderStatus = async (orderId: string, status: string) => {
    try {
      const res = await apiFetch(`/api/orders/${orderId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to update order status');
      notifySuccess(`Order #${orderId} marked as ${status}.`);
      loadOrders();
      if (selectedOrderDetails && selectedOrderDetails.id === orderId) {
        setSelectedOrderDetails({ ...selectedOrderDetails, status });
      }
    } catch (err: any) {
      notifyError(err.message);
    }
  };

  // Filtered Customers
  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.mobile.includes(q)
    );
  }, [customers, customerSearch]);

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchesStatus = orderStatusFilter === 'ALL' || o.status === orderStatusFilter;
      const q = orderSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        o.id.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        o.customer_mobile.includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [orders, orderStatusFilter, orderSearch]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex min-h-dvh items-stretch justify-center bg-white p-0 animate-in fade-in duration-200">
      <div
        className="h-dvh w-full max-w-none bg-white flex flex-col overflow-hidden border-0 text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ========================================================================= */}
        {/* TOP HEADER: "ADMIN PANEL"                                                 */}
        {/* ========================================================================= */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black shadow-md shadow-blue-500/25">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight uppercase">
                ADMIN PANEL
              </h1>
              <p className="text-xs text-slate-500">
                Customer Accounts, Wallets &amp; Security Controls
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Close Admin Panel"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Global Notifications */}
        {globalNotice && (
          <div className="mx-6 mt-3 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{globalNotice}</span>
          </div>
        )}
        {globalError && (
          <div className="mx-6 mt-3 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{globalError}</span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB BODY CONTAINER                                                        */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50">
          {/* TAB 1: HOME (Customer Management) */}
          {activeTab === 'home' && (
            <div className="space-y-4">
              {/* Controls bar */}
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search registered customers by name or mobile..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 bg-white text-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 shadow-2xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={loadCustomers}
                  className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingCustomers ? 'animate-spin text-blue-600' : ''}`} />
                  <span>Refresh Accounts</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setShowLockedDevices((value) => !value); if (!showLockedDevices) loadLockedDevices(); }}
                  className={`px-4 py-2.5 rounded-2xl border font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-2xs ${showLockedDevices ? 'bg-slate-900 text-white border-slate-900' : 'border-rose-200 bg-white text-rose-700 hover:bg-rose-50'}`}
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>{showLockedDevices ? 'Back to Customers' : 'Locked Devices'}</span>
                </button>
              </div>

              {showLockedDevices ? (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                  <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-black text-slate-900">Locked Devices</h3>
                      <p className="text-xs text-slate-500 mt-1">Blocked mobile numbers and registered browser tokens.</p>
                    </div>
                    <button type="button" onClick={loadLockedDevices} className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold flex items-center gap-2">
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingLockedDevices ? 'animate-spin' : ''}`} /> Refresh
                    </button>
                  </div>
                  {loadingLockedDevices ? (
                    <div className="p-10 text-center text-sm text-slate-500">Loading locked devices...</div>
                  ) : lockedDevices.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">
                      <ShieldCheck className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
                      <p className="font-bold text-sm">No locked devices or mobile numbers.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {lockedDevices.map((entry) => (
                        <div key={entry.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-slate-900">{entry.deviceLabel}</span>
                              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-black uppercase">Blocked</span>
                            </div>
                            <div className="text-xs text-slate-600 mt-1">Mobile: <span className="font-mono">{entry.mobile}</span></div>
                            {entry.fingerprint && <div className="text-[11px] text-slate-500 mt-1">Device token: <span className="font-mono">{entry.fingerprint}</span></div>}
                            <div className="text-[11px] text-slate-500 mt-1">{entry.reason} · {entry.blockedAt ? new Date(entry.blockedAt).toLocaleString() : 'Date unavailable'}</div>
                          </div>
                          <button type="button" onClick={() => handleUnlockDevice(entry)} className="shrink-0 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2">
                            <Unlock className="w-4 h-4" /> Unlock
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs divide-y divide-slate-100">
                {filteredCustomers.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 space-y-2">
                    <Users className="w-10 h-10 mx-auto text-slate-300" />
                    <p className="text-sm font-semibold">No registered customers found.</p>
                  </div>
                ) : (
                  filteredCustomers.map((cust) => {
                    const isExpanded = expandedCustomerMobile === cust.mobile;
                    const due = parseFloat(cust.due_balance || '0');
                    const pIn = parseFloat(cust.payment_in || '0');
                    const pOut = parseFloat(cust.payment_out || '0');
                    const netAdvance = pIn - pOut;
                    const monthlyBreakdown = (() => {
                      const grouped: Record<string, { paymentIn: number; paymentOut: number; dueAdded: number; advance: number }> = {};
                      const transactions = Array.isArray(cust.transactions) ? cust.transactions : [];
                      for (const tx of transactions) {
                        const txDate = tx.date ? new Date(tx.date) : null;
                        if (!txDate || Number.isNaN(txDate.getTime())) continue;
                        const monthKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
                        if (!grouped[monthKey]) grouped[monthKey] = { paymentIn: 0, paymentOut: 0, dueAdded: 0, advance: 0 };
                        const amount = Math.max(0, Number.parseFloat(String(tx.amount || '0')) || 0);
                        if (tx.type === 'PAYMENT_IN') grouped[monthKey].paymentIn += amount;
                        else if (tx.type === 'PAYMENT_OUT') grouped[monthKey].paymentOut += amount;
                        else if (tx.type === 'ADD_DUE' || tx.type === 'MONTHLY_FEE') grouped[monthKey].dueAdded += amount;
                      }
                      return Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a)).slice(0, 12).map(([month, totals]) => ({
                        month,
                        ...totals,
                        advance: Math.max(0, totals.paymentIn - totals.paymentOut),
                      }));
                    })();

                    // Color code calculation:
                    // RED: Due balance > 0
                    // BLUE: Advanced payment (net advance > 0)
                    // GREEN: Settled / Zero
                    const statusTheme =
                      due > 0
                        ? { bg: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500', label: `Due: ₹${due}` }
                        : netAdvance > 0
                        ? { bg: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500', label: `Advance: ₹${netAdvance}` }
                        : { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', label: 'Settled (₹0)' };

                    return (
                      <div key={cust.id} className="transition-colors hover:bg-slate-50/60">
                        {/* Summary Header */}
                        <div
                          onClick={() => setExpandedCustomerMobile(isExpanded ? null : cust.mobile)}
                          className="p-4 sm:p-5 flex items-center justify-between cursor-pointer select-none"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center font-bold text-sm shrink-0">
                              {cust.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-extrabold text-sm sm:text-base text-slate-900 flex items-center gap-2 truncate">
                                <span>{cust.name}</span>
                                {cust.resetRequested && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                    Reset Requested
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 font-mono flex items-center gap-2 mt-0.5">
                                <span>{cust.mobile}</span>
                                <span>•</span>
                                <span>Registered {new Date(cust.createdAt).toLocaleDateString()}</span>
                                {cust.monthly_fee > 0 && (
                                  <>
                                    <span>•</span>
                                    <span className="text-blue-600 font-bold">Fee: ₹{cust.monthly_fee}/mo</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            {/* Color-coded Status Badge */}
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${statusTheme.bg}`}
                            >
                              <span className={`w-2 h-2 rounded-full ${statusTheme.dot}`} />
                              <span>{statusTheme.label}</span>
                            </span>

                            <button
                              type="button"
                              className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                            >
                              {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                            </button>
                          </div>
                        </div>

                        {/* Expandable Options Drawer */}
                        {isExpanded && (
                          <div className="px-5 pb-5 pt-2 border-t border-slate-100 bg-slate-50/70 space-y-4">
                            {/* Option Actions Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                              {/* Option 1: Reset Password */}
                              <button
                                type="button"
                                onClick={() => {
                                  setResetTarget(cust);
                                  setNewPassword('');
                                  setConfirmPassword('');
                                }}
                                className="p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 text-left cursor-pointer transition-all shadow-2xs group"
                              >
                                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                                  <KeyRound className="w-4 h-4" />
                                </div>
                                <div className="font-bold text-xs text-slate-900">Reset Password</div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  Define new secure hash password for client
                                </div>
                              </button>

                              {/* Option 2: Add Wallet / Transaction */}
                              <button
                                type="button"
                                onClick={() => {
                                  setWalletTarget(cust);
                                  setWalletTxType('PAYMENT_IN');
                                  setWalletAmount('');
                                  setWalletNotes('');
                                }}
                                className="p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/40 text-left cursor-pointer transition-all shadow-2xs group"
                              >
                                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                                  <Wallet className="w-4 h-4" />
                                </div>
                                <div className="font-bold text-xs text-slate-900">Add Wallet Transaction</div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  Record Payment In, Payment Out, or Add Due
                                </div>
                              </button>

                              {/* Option 3: Set Recurring Fee */}
                              <button
                                type="button"
                                onClick={() => {
                                  setFeeTarget(cust);
                                  setMonthlyFeeInput(String(cust.monthly_fee || ''));
                                }}
                                className="p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40 text-left cursor-pointer transition-all shadow-2xs group"
                              >
                                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                                  <Calendar className="w-4 h-4" />
                                </div>
                                <div className="font-bold text-xs text-slate-900">Set Monthly Recurring Fee</div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  Auto-add recurring fee to customer's due
                                </div>
                              </button>

                              <button
                                type="button"
                                onClick={() => { setDeleteTarget(cust); setDeleteConfirmation(''); }}
                                className="p-3.5 rounded-2xl bg-white border border-rose-200 hover:border-rose-400 hover:bg-rose-50/50 text-left cursor-pointer transition-all shadow-2xs group"
                              >
                                <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                                  <Trash2 className="w-4 h-4" />
                                </div>
                                <div className="font-bold text-xs text-rose-700">Delete Account</div>
                                <div className="text-[11px] text-slate-500 mt-0.5">Permanently remove account data and block registered access tokens.</div>
                              </button>
                            </div>

                            {/* Wallet Summary Columns */}
                            <div className="bg-white rounded-2xl border border-slate-200 p-4">
                              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                                Wallet Financial Columns &amp; Monthly Totals
                              </h4>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-100">
                                  <div className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                                    <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Payment In</span>
                                  </div>
                                  <div className="text-base font-black font-mono text-emerald-900 mt-1">
                                    ₹{pIn.toFixed(2)}
                                  </div>
                                </div>

                                <div className="p-3 rounded-xl bg-amber-50/50 border border-amber-100">
                                  <div className="text-[11px] font-bold text-amber-700 flex items-center gap-1">
                                    <ArrowUpRight className="w-3.5 h-3.5 text-amber-600" />
                                    <span>Payment Out</span>
                                  </div>
                                  <div className="text-base font-black font-mono text-amber-900 mt-1">
                                    ₹{pOut.toFixed(2)}
                                  </div>
                                </div>

                                <div className="p-3 rounded-xl bg-rose-50/50 border border-rose-100">
                                  <div className="text-[11px] font-bold text-rose-700 flex items-center gap-1">
                                    <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                                    <span>Due Balance</span>
                                  </div>
                                  <div className="text-base font-black font-mono text-rose-900 mt-1">
                                    ₹{due.toFixed(2)}
                                  </div>
                                </div>

                                <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-100">
                                  <div className="text-[11px] font-bold text-blue-700 flex items-center gap-1">
                                    <Wallet className="w-3.5 h-3.5 text-blue-600" />
                                    <span>Net Advance</span>
                                  </div>
                                  <div className="text-base font-black font-mono text-blue-900 mt-1">
                                    ₹{Math.max(0, netAdvance).toFixed(2)}
                                  </div>
                                </div>
                              </div>

                              {/* Historical Monthly Wallet Totals */}
                              {monthlyBreakdown.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-slate-100">
                                  <div className="text-xs font-bold text-slate-700 mb-2">Historical Monthly Totals (Last 12 Active Months)</div>
                                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                                    <table className="w-full min-w-[620px] text-left text-[11px]">
                                      <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                                        <tr>
                                          <th className="px-3 py-2">Month</th>
                                          <th className="px-3 py-2 text-right">Payment In</th>
                                          <th className="px-3 py-2 text-right">Payment Out</th>
                                          <th className="px-3 py-2 text-right">Due Added</th>
                                          <th className="px-3 py-2 text-right">Net Advance</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {monthlyBreakdown.map((month) => (
                                          <tr key={month.month}>
                                            <td className="px-3 py-2 font-bold text-slate-700">{month.month}</td>
                                            <td className="px-3 py-2 text-right font-mono text-emerald-700">₹{month.paymentIn.toFixed(2)}</td>
                                            <td className="px-3 py-2 text-right font-mono text-amber-700">₹{month.paymentOut.toFixed(2)}</td>
                                            <td className="px-3 py-2 text-right font-mono text-rose-700">₹{month.dueAdded.toFixed(2)}</td>
                                            <td className="px-3 py-2 text-right font-mono text-blue-700">₹{month.advance.toFixed(2)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {/* Transaction Records */}
                              {cust.transactions && cust.transactions.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-slate-100">
                                  <div className="text-xs font-bold text-slate-700 mb-2">
                                    Recent Ledger &amp; Wallet Activity
                                  </div>
                                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                    {cust.transactions.map((tx: any, idx: number) => (
                                      <div
                                        key={tx.id || idx}
                                        className="text-xs flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100"
                                      >
                                        <div className="flex items-center gap-2">
                                          <span
                                            className={`font-bold ${
                                              tx.type === 'PAYMENT_IN'
                                                ? 'text-emerald-600'
                                                : tx.type === 'PAYMENT_OUT'
                                                ? 'text-amber-600'
                                                : 'text-rose-600'
                                            }`}
                                          >
                                            {tx.type}
                                          </span>
                                          {tx.notes && <span className="text-slate-500">• {tx.notes}</span>}
                                        </div>
                                        <div className="font-mono font-bold text-slate-800">
                                          ₹{parseFloat(tx.amount || '0').toFixed(2)}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              )}
            </div>
          )}

          {/* TAB 2: STORE (Product Catalog & Admin Payment Details) */}
          {activeTab === 'store' && (
            <div className="space-y-6">
              {/* Top Controls: Add Product */}
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900">My Products</h3>
                  <p className="text-xs text-slate-500">Manage products, inventory, pricing, and storefront availability.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingProduct(null);
                    setProductMediaItems([]);
                    setProductForm({
                      title: '',
                      description: '',
                      price: '',
                      compare_price: '',
                      mediaUrl: '',
                      variantsText: '',
                      stock: '0',
                      is_published: true,
                    });
                    setIsProductModalOpen(true);
                  }}
                  className="px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add a Product</span>
                </button>
              </div>

              {/* Products Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.length === 0 ? (
                  <div className="col-span-full bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center text-slate-400 space-y-3">
                    <Store className="w-12 h-12 mx-auto text-slate-300" />
                    <p className="text-sm font-semibold">No products in store catalog yet.</p>
                    <button
                      type="button"
                      onClick={() => setIsProductModalOpen(true)}
                      className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs"
                    >
                      Add a Product
                    </button>
                  </div>
                ) : (
                  products.map((p) => {
                    const media = Array.isArray(p.media) ? p.media : [];
                    const img = media[0] || '';

                    return (
                      <div
                        key={p.id}
                        className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-2xs flex flex-col justify-between"
                      >
                        <div>
                          {/* Image */}
                          <div className="h-44 bg-slate-100 relative overflow-hidden flex items-center justify-center">
                            {img ? (
                              /\.(mp4|webm|mov)(\?|$)/i.test(img)
                                ? <video src={img} className="w-full h-full object-cover" muted playsInline />
                                : <img src={img} alt={p.title} className="w-full h-full object-cover" />
                            ) : (
                              <Store className="w-10 h-10 text-slate-300" />
                            )}
                            <span
                              className={`absolute top-3 right-3 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                p.is_published
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-slate-700 text-white'
                              }`}
                            >
                              {p.is_published ? 'Published' : 'Draft'}
                            </span>
                          </div>

                          {/* Info */}
                          <div className="p-4 space-y-1">
                            <h4 className="font-black text-sm text-slate-900 truncate">{p.title}</h4>
                            {p.description && (
                              <p className="text-xs text-slate-500 line-clamp-2">{p.description}</p>
                            )}
                            <p className={`text-xs font-bold pt-1 ${(p as any).stock <= 5 ? 'text-amber-700' : 'text-emerald-700'}`}>Stock: {Number((p as any).stock ?? 0)} units</p>
                            <div className="flex items-baseline gap-2 pt-1">
                              <span className="text-base font-black text-blue-700 font-mono">
                                ₹{p.price}
                              </span>
                              {p.compare_price && p.compare_price > p.price && (
                                <span className="text-xs text-slate-400 line-through font-mono">
                                  ₹{p.compare_price}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="p-3 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/50">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProduct(p);
                              setProductMediaItems(media.map((url: string, index: number) => ({ id: `saved-${p.id}-${index}`, previewUrl: url, url, isVideo: /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) })));
                              setProductForm({
                                title: p.title,
                                description: p.description || '',
                                price: String(p.price),
                                compare_price: String(p.compare_price || ''),
                                mediaUrl: media.join('\n'),
                                variantsText: (Array.isArray(p.variants) ? p.variants : []).filter((v: any) => v && typeof v === 'object').map((v: any) => `${v.name}: ${(v.options || []).join(', ')}`).join('\n'),
                                stock: String((p as any).stock ?? 0),
                                is_published: p.is_published,
                              });
                              setIsProductModalOpen(true);
                            }}
                            className="p-2 rounded-xl text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                            title="Edit Product"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(p.id, p.title)}
                            className="p-2 rounded-xl text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Delete Product"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Customer Checkout Payment Options */}
              <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 shrink-0 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-black text-sm text-slate-900">Customer Checkout Payment Options</h4>
                    <p className="text-xs text-slate-500">Manage the QR code, UPI phone number, and UPI ID shown at checkout.</p>
                  </div>
                  {hasSavedPaymentDetails && !editingPaymentSettings && (
                    <button type="button" onClick={() => setEditingPaymentSettings(true)} className="shrink-0 rounded-xl border border-blue-200 bg-white px-4 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50">Edit</button>
                  )}
                </div>

                {hasSavedPaymentDetails && !editingPaymentSettings ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Payment QR Code</p>
                      {paymentSettings.qr_code_url ? <img src={paymentSettings.qr_code_url} alt="Saved payment QR code" className="mt-2 h-28 w-28 rounded-xl border border-slate-200 bg-white object-contain p-1" /> : <p className="mt-2 text-sm text-slate-400">Not configured</p>}
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">UPI Phone Number</p>
                      <p className="mt-2 break-words text-sm font-bold text-slate-900">{paymentSettings.phone_number || 'Not configured'}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">UPI ID</p>
                      <p className="mt-2 break-all text-sm font-bold text-slate-900">{paymentSettings.upi_id || 'Not configured'}</p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSavePaymentSettings} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="min-w-0">
                        <label className="block text-xs font-bold text-slate-700 mb-1">Payment QR Code Image</label>
                        <input type="file" accept="image/*" onChange={(e) => { void handleQrCodeUpload(e.target.files?.[0]); e.currentTarget.value = ''; }} className="w-full max-w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs mb-2" />
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">Or enter QR Code Image URL</label>
                        <input type="url" value={paymentSettings.qr_code_url || ''} onChange={(e) => setPaymentSettings({ ...paymentSettings, qr_code_url: e.target.value })} placeholder="https://example.com/qr-code.png" className="w-full min-w-0 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:border-blue-600 focus:outline-none" />
                      </div>
                      <div className="min-w-0">
                        <label className="block text-xs font-bold text-slate-700 mb-1">UPI Phone Number</label>
                        <input type="tel" inputMode="tel" value={paymentSettings.phone_number || ''} onChange={(e) => setPaymentSettings({ ...paymentSettings, phone_number: e.target.value })} placeholder="Enter UPI phone number" className="w-full min-w-0 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:border-blue-600 focus:outline-none" />
                      </div>
                      <div className="min-w-0">
                        <label className="block text-xs font-bold text-slate-700 mb-1">UPI ID</label>
                        <input type="text" value={paymentSettings.upi_id || ''} onChange={(e) => setPaymentSettings({ ...paymentSettings, upi_id: e.target.value })} placeholder="e.g. username@okhdfcbank" className="w-full min-w-0 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:border-blue-600 focus:outline-none" />
                      </div>
                    </div>
                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                      {hasSavedPaymentDetails && <button type="button" onClick={() => { void loadPaymentSettings(); }} className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">Cancel</button>}
                      <button type="submit" disabled={savingPaymentSettings} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
                        <Check className="w-4 h-4" />
                        <span>{savingPaymentSettings ? 'Saving...' : 'Save Payment Details'}</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ORDERS (Order Management) */}
          {activeTab === 'orders' && (
            <div className="space-y-4">
              {/* Controls */}
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    placeholder="Search orders by Order ID, customer name, mobile..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 bg-white text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={orderStatusFilter}
                    onChange={(e) => setOrderStatusFilter(e.target.value)}
                    className="px-3 py-2.5 rounded-2xl border border-slate-200 bg-white text-xs font-bold text-slate-700 focus:border-blue-600 focus:outline-none"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="CONFIRMED">Confirmed</option>
                    <option value="PROCESSING">Processing</option>
                    <option value="SHIPPED">Shipped</option>
                    <option value="DELIVERED">Delivered</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>

                  <button
                    type="button"
                    onClick={loadOrders}
                    className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingOrders ? 'animate-spin text-blue-600' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* Orders Table */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-2xs">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="p-4">Order ID &amp; Date</th>
                      <th className="p-4">Customer Details</th>
                      <th className="p-4">Items</th>
                      <th className="p-4">Payment</th>
                      <th className="p-4">Grand Total</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-14 text-center text-slate-400">
                          <Package className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                          <p className="text-sm font-semibold">No customer orders found.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredOrders.map((ord) => {
                        const items = Array.isArray(ord.items) ? ord.items : [];
                        const itemCount = items.reduce((sum: number, it: any) => sum + (parseInt(it.quantity || '1', 10) || 1), 0);

                        return (
                          <tr key={ord.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="p-4">
                              <div className="font-mono font-bold text-blue-700 text-xs">{ord.id}</div>
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                {new Date(ord.created_at).toLocaleString('en-IN', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="font-bold text-slate-900">{ord.customer_name}</div>
                              <div className="text-xs text-slate-500 font-mono">{ord.customer_mobile}</div>
                            </td>
                            <td className="p-4">
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                                {itemCount} {itemCount === 1 ? 'item' : 'items'}
                              </span>
                            </td>
                            <td className="p-4">
                              <div className="text-xs font-bold text-slate-800">{ord.payment_method}</div>
                              {ord.payment_sub_option && (
                                <div className="text-[10px] text-slate-400">{ord.payment_sub_option}</div>
                              )}
                              <div className={`text-[10px] font-bold mt-1 ${String((ord as any).payment_status || '').toUpperCase() === 'VERIFIED' ? 'text-emerald-700' : ord.payment_method === 'ONLINE' ? 'text-amber-700' : 'text-slate-500'}`}>
                                Payment: {(ord as any).payment_status || (ord.payment_method === 'COD' ? 'COD_DUE' : 'PENDING')}
                              </div>
                              {ord.payment_method === 'ONLINE' && String((ord as any).payment_status || 'PENDING').toUpperCase() !== 'VERIFIED' && ord.status !== 'CANCELLED' && (
                                <button type="button" onClick={() => void handleVerifyOrderPayment(ord.id)} className="mt-2 rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1 text-[10px] font-bold text-emerald-800">Verify payment</button>
                              )}
                            </td>
                            <td className="p-4 font-mono font-black text-slate-900">
                              ₹{parseFloat(String(ord.grand_total || '0')).toFixed(2)}
                            </td>
                            <td className="p-4">
                              <select
                                value={ord.status}
                                onChange={(e) => handleUpdateOrderStatus(ord.id, e.target.value)}
                                className={`px-2.5 py-1 rounded-xl text-xs font-bold border focus:outline-none ${
                                  ord.status === 'COMPLETED'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : ord.status === 'CANCELLED'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : ord.status === 'PROCESSING'
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}
                              >
                                {ord.status === 'PAYMENT_PENDING' && <option value="PAYMENT_PENDING">PAYMENT_PENDING</option>}
                                <option value="CONFIRMED" disabled={ord.payment_method === 'ONLINE' && String((ord as any).payment_status || 'PENDING').toUpperCase() !== 'VERIFIED'}>CONFIRMED</option>
                                <option value="PROCESSING" disabled={ord.payment_method === 'ONLINE' && String((ord as any).payment_status || 'PENDING').toUpperCase() !== 'VERIFIED'}>PROCESSING</option>
                                <option value="SHIPPED" disabled={ord.payment_method === 'ONLINE' && String((ord as any).payment_status || 'PENDING').toUpperCase() !== 'VERIFIED'}>SHIPPED</option>
                                <option value="DELIVERED" disabled={ord.payment_method === 'ONLINE' && String((ord as any).payment_status || 'PENDING').toUpperCase() !== 'VERIFIED'}>DELIVERED</option>
                                <option value="COMPLETED" disabled={ord.payment_method === 'ONLINE' && String((ord as any).payment_status || 'PENDING').toUpperCase() !== 'VERIFIED'}>COMPLETED</option>
                                <option value="CANCELLED">CANCELLED</option>
                              </select>
                            </td>
                            <td className="p-4 text-right">
                              <button
                                type="button"
                                onClick={() => setSelectedOrderDetails(ord)}
                                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 text-slate-700 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                              >
                                Details
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* BOTTOM NAVIGATION: Home, Store, Orders                                     */}
        {/* ========================================================================= */}
        <div className="border-t border-slate-200 bg-white px-4 py-2 shrink-0">
          <div className="max-w-md mx-auto grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              className={`flex flex-col items-center justify-center py-2 px-3 rounded-2xl transition-all cursor-pointer ${
                activeTab === 'home'
                  ? 'bg-blue-600 text-white font-black shadow-md shadow-blue-500/25'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 font-bold'
              }`}
            >
              <Users className="w-5 h-5" />
              <span className="text-[11px] mt-1">Home</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('store')}
              className={`flex flex-col items-center justify-center py-2 px-3 rounded-2xl transition-all cursor-pointer ${
                activeTab === 'store'
                  ? 'bg-blue-600 text-white font-black shadow-md shadow-blue-500/25'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 font-bold'
              }`}
            >
              <Store className="w-5 h-5" />
              <span className="text-[11px] mt-1">Store</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className={`flex flex-col items-center justify-center py-2 px-3 rounded-2xl transition-all cursor-pointer ${
                activeTab === 'orders'
                  ? 'bg-blue-600 text-white font-black shadow-md shadow-blue-500/25'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 font-bold'
              }`}
            >
              <Package className="w-5 h-5" />
              <span className="text-[11px] mt-1">Orders</span>
            </button>
          </div>
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-delete-title">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-rose-200">
            <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center mb-4"><Ban className="w-5 h-5" /></div>
            <h3 id="confirm-delete-title" className="font-black text-lg text-slate-900">Confirm Delete</h3>
            <p className="text-sm text-slate-600 mt-2">This permanently deletes <strong>{deleteTarget.name}</strong> ({deleteTarget.mobile}) and tenant-owned records. The mobile number and registered browser tokens will be blocked until an administrator unlocks them. This action cannot be undone.</p>
            <label className="block text-xs font-bold text-slate-700 mt-5 mb-1">Type DELETE to confirm</label>
            <input value={deleteConfirmation} onChange={(e) => setDeleteConfirmation(e.target.value)} autoComplete="off" placeholder="DELETE" className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono focus:border-rose-600 focus:outline-none" />
            <div className="flex gap-2 pt-5">
              <button type="button" onClick={() => { setDeleteTarget(null); setDeleteConfirmation(''); }} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs">Cancel</button>
              <button type="button" onClick={handleDeleteAccount} disabled={deleteLoading || deleteConfirmation !== 'DELETE'} className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs disabled:opacity-40">{deleteLoading ? 'Deleting...' : 'Confirm Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: RESET PASSWORD                                                   */}
      {/* ========================================================================= */}
      {resetTarget && (
        <div className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <h3 className="font-black text-base text-slate-900">Reset Customer Password</h3>
              </div>
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Define a new secure password for <strong className="text-slate-800">{resetTarget.name}</strong> ({resetTarget.mobile}).
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 chars, letters and numbers"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePasswordReset}
                  disabled={resetLoading}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer disabled:opacity-50"
                >
                  {resetLoading ? 'Saving...' : 'Save Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ADD WALLET TRANSACTION                                            */}
      {/* ========================================================================= */}
      {walletTarget && (
        <div className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </div>
                <h3 className="font-black text-base text-slate-900">Add Wallet Transaction</h3>
              </div>
              <button
                type="button"
                onClick={() => setWalletTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Customer: <strong className="text-slate-800">{walletTarget.name}</strong> ({walletTarget.mobile})
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Transaction Type</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setWalletTxType('PAYMENT_IN')}
                    className={`py-2 text-xs font-bold rounded-xl border text-center transition-all ${
                      walletTxType === 'PAYMENT_IN'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Payment In
                  </button>
                  <button
                    type="button"
                    onClick={() => setWalletTxType('PAYMENT_OUT')}
                    className={`py-2 text-xs font-bold rounded-xl border text-center transition-all ${
                      walletTxType === 'PAYMENT_OUT'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Payment Out
                  </button>
                  <button
                    type="button"
                    onClick={() => setWalletTxType('ADD_DUE')}
                    className={`py-2 text-xs font-bold rounded-xl border text-center transition-all ${
                      walletTxType === 'ADD_DUE'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Add Due
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Amount (₹)</label>
                <IndianAmountInput
                  step="0.01"
                  value={walletAmount}
                  onValueChange={setWalletAmount}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Notes / Narration</label>
                <input
                  type="text"
                  value={walletNotes}
                  onChange={(e) => setWalletNotes(e.target.value)}
                  placeholder="e.g. Bank transfer reference, cash settlement"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setWalletTarget(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveWalletTx}
                  disabled={walletLoading}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer disabled:opacity-50"
                >
                  {walletLoading ? 'Saving...' : 'Record Transaction'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: SET MONTHLY RECURRING FEE                                        */}
      {/* ========================================================================= */}
      {feeTarget && (
        <div className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Calendar className="w-4 h-4" />
                </div>
                <h3 className="font-black text-base text-slate-900">Set Monthly Recurring Fee</h3>
              </div>
              <button
                type="button"
                onClick={() => setFeeTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Define a monthly subscription/service fee for <strong className="text-slate-800">{feeTarget.name}</strong>. After every 30 days, this fee will automatically add to the customer's due balance.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Monthly Fee Amount (₹)</label>
                <IndianAmountInput
                  step="0.01"
                  value={monthlyFeeInput}
                  onValueChange={setMonthlyFeeInput}
                  placeholder="e.g. 500.00 (Enter 0 to disable)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setFeeTarget(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveMonthlyFee}
                  disabled={feeLoading}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer disabled:opacity-50"
                >
                  {feeLoading ? 'Saving...' : 'Set Fee'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: ADD / EDIT PRODUCT                                               */}
      {/* ========================================================================= */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-base text-slate-900">
                {editingProduct ? 'Edit Catalog Product' : 'Add New Product'}
              </h3>
              <button
                type="button"
                onClick={() => setIsProductModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Product Title *</label>
                <input
                  type="text"
                  required
                  value={productForm.title}
                  onChange={(e) => setProductForm({ ...productForm, title: e.target.value })}
                  placeholder="e.g. GST Accounting Ledger Binder"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={productForm.description}
                  onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                  placeholder="Product description and details..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Selling Price (₹) *</label>
                  <IndianAmountInput
                  step="0.01"
                  required
                  value={productForm.price}
                  onValueChange={(value) => setProductForm({ ...productForm, price: value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-sm focus:border-blue-600 focus:outline-none"
                />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Compare Price (₹)</label>
                  <IndianAmountInput
                  step="0.01"
                  value={productForm.compare_price}
                  onValueChange={(value) => setProductForm({ ...productForm, compare_price: value })}
                  placeholder="799.00"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-sm focus:border-blue-600 focus:outline-none"
                />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Available Stock (units) *</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={productForm.stock}
                  onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="space-y-2.5">
                <label className="block text-xs font-bold text-slate-700">Product Photos and Videos</label>
                <label
                  onDragOver={(event) => { event.preventDefault(); setMediaDragActive(true); }}
                  onDragLeave={() => setMediaDragActive(false)}
                  onDrop={(event) => { event.preventDefault(); setMediaDragActive(false); void handleProductMediaUpload(event.dataTransfer.files); }}
                  className={`flex min-h-32 w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-5 text-center transition-colors ${mediaDragActive ? 'border-blue-600 bg-blue-50' : 'border-blue-200 bg-blue-50/50 hover:border-blue-500 hover:bg-blue-50'} ${uploadingMedia ? 'pointer-events-none opacity-60' : ''}`}
                >
                  <input type="file" accept="image/*,video/*" multiple disabled={uploadingMedia} onChange={(event) => { void handleProductMediaUpload(event.currentTarget.files); event.currentTarget.value = ''; }} className="sr-only" />
                  <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm"><Plus className="h-6 w-6" /></span>
                  <span className="text-sm font-extrabold text-slate-800">Drag and Drop</span>
                  <span className="mt-1 text-xs text-slate-500">or tap to open your device gallery</span>
                  <span className="mt-1 text-[11px] text-slate-400">Images and videos supported</span>
                </label>
                {uploadingMedia && <p className="text-xs font-bold text-blue-600" role="status">Uploading selected media...</p>}
                {productMediaItems.length > 0 && (
                  <div className="flex gap-3 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-3" aria-label="Selected product media previews">
                    {productMediaItems.map((item, index) => (
                      <div key={item.id} className="relative w-36 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        {item.isVideo ? <video src={item.previewUrl} controls preload="metadata" className="h-28 w-full object-contain bg-slate-100" /> : <img src={item.previewUrl} alt={`Product media ${index + 1}`} className="h-28 w-full object-contain bg-slate-100" />}
                        <span className={`block truncate px-2 py-1 text-[10px] font-bold ${item.url ? 'text-emerald-700' : 'text-blue-700'}`}>{item.url ? 'Ready to publish' : 'Uploading...'}</span>
                        <button type="button" onClick={() => removeProductMedia(item.id)} aria-label={`Remove media ${index + 1}`} title="Remove media" className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-rose-600 shadow hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-slate-500">A published product must have at least one uploaded image or video.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Product Variants</label>
                <textarea rows={3} value={productForm.variantsText} onChange={(e) => setProductForm({ ...productForm, variantsText: e.target.value })} placeholder={'Size: Small, Medium, Large\nColor: Black, Blue, White'} className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:border-blue-600 focus:outline-none" />
                <p className="text-[11px] text-slate-500">Enter one variant per line using the format: Variant Name: Option 1, Option 2.</p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="prod_pub"
                  checked={productForm.is_published}
                  onChange={(e) => setProductForm({ ...productForm, is_published: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="prod_pub" className="text-xs font-bold text-slate-800">
                  Publish product immediately to storefront
                </label>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadingMedia || savingProduct}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer disabled:opacity-50"
                >
                  {savingProduct ? 'Saving Product...' : editingProduct ? 'Update Product' : 'Publish Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: ORDER DETAILS BREAKDOWN                                          */}
      {/* ========================================================================= */}
      {selectedOrderDetails && (
        <div className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 max-h-[92dvh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="font-mono text-xs font-bold text-blue-600">{selectedOrderDetails.id}</span>
                <h3 className="font-black text-base text-slate-900 mt-0.5">Customer Order Summary</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderDetails(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Customer & Address */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1 text-xs">
              <div className="font-bold text-slate-900">{selectedOrderDetails.customer_name}</div>
              <div className="text-slate-500 font-mono">{selectedOrderDetails.customer_mobile}</div>
              {selectedOrderDetails.customer_email && (
                <div className="text-slate-500">{selectedOrderDetails.customer_email}</div>
              )}
              {selectedOrderDetails.address && (
                <div className="text-slate-600 pt-1 border-t border-slate-200/60 mt-1">
                  <strong>Delivery Address:</strong>{' '}
                  {[selectedOrderDetails.address.street, selectedOrderDetails.address.building_number, selectedOrderDetails.address.landmark, selectedOrderDetails.address.line1, selectedOrderDetails.address.line2, selectedOrderDetails.address.pincode].filter(Boolean).join(', ')}
                </div>
              )}
            </div>

            {/* Itemized list */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Ordered Items</h4>
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                {(selectedOrderDetails.items || []).map((itm, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between text-xs bg-white">
                    <div>
                      <div className="font-bold text-slate-900">{itm.title}</div>
                      <div className="text-slate-500">Qty: {itm.quantity} × ₹{itm.price}</div>
                      {itm.variant && <div className="text-slate-500 mt-0.5">Variants: {itm.variant}</div>}
                    </div>
                    <div className="font-mono font-bold text-slate-900">
                      ₹{(itm.price * itm.quantity).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Total Breakdown */}
            <div className="p-3.5 rounded-2xl bg-blue-50/50 border border-blue-100 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-mono font-bold">₹{selectedOrderDetails.subtotal}</span>
              </div>
              {selectedOrderDetails.cod_fee > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>COD Handling Fee:</span>
                  <span className="font-mono font-bold">₹{selectedOrderDetails.cod_fee}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black text-slate-900 pt-1.5 border-t border-blue-200">
                <span>Grand Total:</span>
                <span className="font-mono text-blue-700">₹{selectedOrderDetails.grand_total}</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setSelectedOrderDetails(null)}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer"
              >
                Close Order Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import { apiFetch } from '../utils/api';
import React, { useState, useRef, useEffect } from 'react';
import { buildPngBlob, downloadBlob, printElementFallback, shareFile } from '../utils/pdfShare';
import { shareTextOrLink } from '../utils/shareUtils';
import { playSuccessTone, triggerHaptic } from '../utils/feedback';
import { IndianAmountInput } from './IndianAmountInput';
import {
  ArrowLeft,
  Share2,
  Upload,
  Phone,
  Mail,
  MapPin,
  PenTool,
  Check,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  X,
  RotateCcw,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { CompanyProfile } from '../types';

interface BusinessProfileModalProps {
  isOpen: boolean;
  company: CompanyProfile | null;
  onClose: () => void;
  onSave: (data: Partial<CompanyProfile>) => Promise<void>;
}

export const BusinessProfileModal: React.FC<BusinessProfileModalProps> = ({
  isOpen,
  company,
  onClose,
  onSave,
}) => {
  const [activeTab, setActiveTab] = useState<'basic' | 'business'>('basic');
  const [saving, setSaving] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const [cardBusy, setCardBusy] = useState(false);
  const [cardStatus, setCardStatus] = useState('');

  // Form State
  const [tradeName, setTradeName] = useState(company?.trade_name || company?.name || '');
  const [gstin, setGstin] = useState(company?.gstin || '');
  const [showGstinOnCard, setShowGstinOnCard] = useState(company?.show_gstin_on_card ?? true);
  const [phone1, setPhone1] = useState(company?.phone || '');
  const [phone2, setPhone2] = useState(company?.phone2 || '');
  const [email, setEmail] = useState(company?.email || '');
  const [address, setAddress] = useState(company?.address || '');
  const [pincode, setPincode] = useState(company?.pincode || '');
  const [description, setDescription] = useState(company?.business_description || '');

  // Business Details State
  const [state, setState] = useState(company?.state || 'Delhi');
  const [businessType, setBusinessType] = useState(company?.business_type || 'Retail');
  const [showTypeOnCard, setShowTypeOnCard] = useState(company?.show_type_on_card ?? false);
  const [businessCategory, setBusinessCategory] = useState(company?.business_category || 'Hardware & Tools');
  const [showCategoryOnCard, setShowCategoryOnCard] = useState(company?.show_category_on_card ?? false);
  const [booksBeginningDate, setBooksBeginningDate] = useState(company?.books_beginning_date || '2026-04-01');
  const [openingCapital, setOpeningCapital] = useState<string | number>(company?.opening_capital ?? 0);

  // Media
  const [logoBase64, setLogoBase64] = useState<string | undefined>(company?.logo_base64);
  const [signatureBase64, setSignatureBase64] = useState<string | undefined>(company?.signature_base64);

  // Card themes carousel - Blue & White primary theme with Green accent options
  const cardThemes = [
    {
      id: 'classic_blue',
      name: 'Royal Blue & White',
      cardBg: 'bg-white text-slate-800 border-slate-200 shadow-md',
      titleColor: 'text-blue-600',
      accentBar: 'bg-blue-600',
      btnBg: 'bg-blue-600 hover:bg-blue-700 text-white',
    },
    {
      id: 'emerald_luxe',
      name: 'Emerald Prestige (Green & White)',
      cardBg: 'bg-white text-emerald-950 border-emerald-300 shadow-md',
      titleColor: 'text-emerald-700',
      accentBar: 'bg-emerald-600',
      btnBg: 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold',
    },
    {
      id: 'navy_executive',
      name: 'Navy Executive',
      cardBg: 'bg-gradient-to-r from-slate-900 to-indigo-950 text-slate-100 border-indigo-800 shadow-md',
      titleColor: 'text-cyan-400',
      accentBar: 'bg-cyan-400',
      btnBg: 'bg-cyan-600 hover:bg-cyan-500 text-white',
    },
  ];
  const [currentThemeIdx, setCurrentThemeIdx] = useState(0);

  // Signature Pad State
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const isUserModifiedRef = useRef(false);
  const hydratedForOpenRef = useRef(false);
  const previousCompletionRef = useRef(0);

  useEffect(() => {
    if (isOpen) setActiveTab('basic');
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      if (!hydratedForOpenRef.current) {
        hydratedForOpenRef.current = true;
        isUserModifiedRef.current = false;

        let draftData: any = null;
        try {
          const raw = localStorage.getItem('cotrix_profile_draft');
          if (raw) draftData = JSON.parse(raw);
        } catch {}

        // DB data takes priority over local storage draft; draft is only a fallback
        const hasDbData = company && Boolean(
          company.trade_name || company.name || company.gstin || company.phone || company.email || company.address || company.state
        );

        const source = hasDbData 
          ? { ...(draftData || {}), ...company } 
          : (company || draftData || {});

        setTradeName(source.trade_name || source.name || '');
        setGstin(source.gstin || '');
        setShowGstinOnCard(source.show_gstin_on_card ?? true);
        setPhone1(source.phone || source.phone1 || '');
        setPhone2(source.phone2 || '');
        setEmail(source.email || '');
        setAddress(source.address || '');
        setPincode(source.pincode || '');
        setDescription(source.business_description || source.description || '');
        setState(source.state || 'Delhi');
        setBusinessType(source.business_type || 'Retail');
        setShowTypeOnCard(source.show_type_on_card ?? false);
        setBusinessCategory(source.business_category || 'Hardware & Tools');
        setShowCategoryOnCard(source.show_category_on_card ?? false);
        setBooksBeginningDate(source.books_beginning_date || '2026-04-01');
        setOpeningCapital(source.opening_capital ?? 0);
        setLogoBase64(source.logo_base64);
        setSignatureBase64(source.signature_base64);
        if (source.card_theme) {
          const idx = cardThemes.findIndex((t) => t.id === source.card_theme);
          if (idx !== -1) setCurrentThemeIdx(idx);
        }
      } else if (!isUserModifiedRef.current && company) {
        // If the user hasn't edited the form yet and company just finished loading from DB,
        // safely update fields with real DB data without touching anything if user started typing
        setTradeName(company.trade_name || company.name || '');
        setGstin(company.gstin || '');
        setShowGstinOnCard(company.show_gstin_on_card ?? true);
        setPhone1(company.phone || company.phone2 || '');
        setPhone2(company.phone2 || '');
        setEmail(company.email || '');
        setAddress(company.address || '');
        setPincode(company.pincode || '');
        setDescription(company.business_description || '');
        setState(company.state || 'Delhi');
        setBusinessType(company.business_type || 'Retail');
        setShowTypeOnCard(company.show_type_on_card ?? false);
        setBusinessCategory(company.business_category || 'Hardware & Tools');
        setShowCategoryOnCard(company.show_category_on_card ?? false);
        setBooksBeginningDate(company.books_beginning_date || '2026-04-01');
        setOpeningCapital(company.opening_capital ?? 0);
        setLogoBase64(company.logo_base64);
        setSignatureBase64(company.signature_base64);
        if (company.card_theme) {
          const idx = cardThemes.findIndex((t) => t.id === company.card_theme);
          if (idx !== -1) setCurrentThemeIdx(idx);
        }
      }
    } else {
      hydratedForOpenRef.current = false;
      isUserModifiedRef.current = false;
    }
  }, [isOpen, company]);

  // Save in-progress typing to local draft so scrolling or navigating never loses data
  useEffect(() => {
    if (isOpen && isUserModifiedRef.current) {
      try {
        localStorage.setItem(
          'cotrix_profile_draft',
          JSON.stringify({
            trade_name: tradeName,
            name: tradeName,
            gstin,
            show_gstin_on_card: showGstinOnCard,
            phone: phone1,
            phone2,
            email,
            address,
            pincode,
            business_description: description,
            state,
            business_type: businessType,
            show_type_on_card: showTypeOnCard,
            business_category: businessCategory,
            show_category_on_card: showCategoryOnCard,
            books_beginning_date: booksBeginningDate,
            opening_capital: openingCapital,
            logo_base64: logoBase64,
            signature_base64: signatureBase64,
            card_theme: cardThemes[currentThemeIdx]?.id,
          })
        );
      } catch {}
    }
  }, [
    isOpen,
    tradeName,
    gstin,
    showGstinOnCard,
    phone1,
    phone2,
    email,
    address,
    pincode,
    description,
    state,
    businessType,
    showTypeOnCard,
    businessCategory,
    showCategoryOnCard,
    booksBeginningDate,
    openingCapital,
    logoBase64,
    signatureBase64,
    currentThemeIdx,
  ]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sigFileInputRef = useRef<HTMLInputElement>(null);

  // Calculate Profile Completion %
  const totalFields = 9;
  let filledCount = 0;
  if (tradeName) filledCount++;
  if (gstin) filledCount++;
  if (phone1) filledCount++;
  if (email) filledCount++;
  if (address) filledCount++;
  if (pincode) filledCount++;
  if (logoBase64) filledCount++;
  if (signatureBase64) filledCount++;
  if (state) filledCount++;
  const completionPercentage = Math.round((filledCount / totalFields) * 100);

  useEffect(() => {
    if (isOpen && isUserModifiedRef.current && completionPercentage === 100 && previousCompletionRef.current < 100) {
      playSuccessTone();
    }
    previousCompletionRef.current = completionPercentage;
  }, [isOpen, completionPercentage]);

  const markDirty = () => {
    isUserModifiedRef.current = true;
  };

  // Logo upload handler
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          markDirty();
          setLogoBase64(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Signature file upload handler
  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          markDirty();
          setSignatureBase64(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Signature canvas setup
  useEffect(() => {
    if (isSignatureModalOpen && canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, [isSignatureModalOpen]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      markDirty();
      setSignatureBase64(dataUrl);
      setIsSignatureModalOpen(false);
    }
  };

  const cardRef = useRef<HTMLDivElement>(null);

  const handleShareCard = async () => {
    const card = cardRef.current;
    if (!card || cardBusy) return;
    setCardBusy(true);
    setCardStatus('Preparing visiting card image...');
    try {
      const blob = await buildPngBlob(card, 900);
      const safeTitle = (tradeName || 'business-card').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      await shareFile({
        blob,
        fileName: `${safeTitle}.png`,
        title: tradeName || 'Visiting Card',
        text: `${tradeName || 'Business'} Profile & Visiting Card`,
        mimeType: 'image/png',
        extension: '.png',
        onStatus: (message) => { if (message) { setCardStatus(message); setShareToast(true); window.setTimeout(() => setShareToast(false), 3500); } },
      });
    } catch (err) {
      console.error('Business card image share failed:', err);
      try {
        const result = await shareTextOrLink({
          title: tradeName || 'Business Profile',
          text: [tradeName, gstin ? `GSTIN: ${gstin}` : '', phone1 ? `Phone: ${phone1}` : '', email ? `Email: ${email}` : '', address].filter(Boolean).join('\n'),
          onStatus: (message) => { if (message) { setCardStatus(message); setShareToast(true); window.setTimeout(() => setShareToast(false), 3500); } },
        });
        if (result === 'copied') setCardStatus('Card image unavailable. Profile details were copied instead.');
      } catch {
        setCardStatus('Card image and profile sharing are unavailable in this browser.');
        setShareToast(true);
        window.setTimeout(() => setShareToast(false), 3500);
      }
    } finally { setCardBusy(false); }
  };

  const handleShareProfile = async () => {
    if (cardBusy) return;
    setCardBusy(true);
    try {
      const details = [
        tradeName,
        gstin ? `GSTIN: ${gstin}` : '',
        phone1 ? `Phone: ${phone1}` : '',
        phone2 ? `Phone 2: ${phone2}` : '',
        email ? `Email: ${email}` : '',
        address,
      ].filter(Boolean).join('\n');
      await shareTextOrLink({
        title: tradeName || 'Business Profile',
        text: details || 'Business profile',
        onStatus: (message) => { if (message) { setCardStatus(message); setShareToast(true); window.setTimeout(() => setShareToast(false), 3500); } },
      });
    } catch (err) {
      console.error('Profile sharing failed:', err);
      setCardStatus('Profile could not be shared or copied.');
      setShareToast(true);
      window.setTimeout(() => setShareToast(false), 3500);
    } finally { setCardBusy(false); }
  };

  const handleDownloadCard = async () => {
    const card = cardRef.current;
    if (!card || cardBusy) return;
    setCardBusy(true);
    setCardStatus('Preparing visiting card image...');
    try {
      const blob = await buildPngBlob(card, 900);
      const safeTitle = (tradeName || 'Cotrix_Business_Visiting_Card').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'Cotrix_Business_Visiting_Card';
      downloadBlob(blob, `${safeTitle}.png`);
      setCardStatus('Visiting card image download started.');
      setShareToast(true);
      window.setTimeout(() => setShareToast(false), 3500);
    } catch (err) {
      console.error('Business card image download failed:', err);
      if (!printElementFallback(card, (message) => {
        setCardStatus(message);
        setShareToast(true);
        window.setTimeout(() => setShareToast(false), 5000);
      })) {
        setCardStatus('Image export and print fallback both failed.');
        setShareToast(true);
        window.setTimeout(() => setShareToast(false), 3500);
      }
    } finally { setCardBusy(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        trade_name: tradeName,
        name: tradeName,
        gstin,
        phone: phone1,
        phone2,
        email,
        address,
        pincode,
        state,
        business_type: businessType,
        business_category: businessCategory,
        business_description: description,
        books_beginning_date: booksBeginningDate,
        opening_capital: parseFloat(String(openingCapital)) || 0,
        show_gstin_on_card: showGstinOnCard,
        show_type_on_card: showTypeOnCard,
        show_category_on_card: showCategoryOnCard,
        card_theme: cardThemes[currentThemeIdx].id,
        logo_base64: logoBase64,
        signature_base64: signatureBase64,
      });
      triggerHaptic(28);
      try {
        localStorage.removeItem('cotrix_profile_draft');
      } catch {}
      onClose();
    } catch (err) {
      console.error('Error saving business profile:', err);
    } finally {
      setSaving(false);
    }
  };

  const currentTheme = cardThemes[currentThemeIdx];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 sm:bg-black/75 sm:backdrop-blur-sm sm:items-center sm:justify-center sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      
      <div 
        className="w-full sm:max-w-2xl bg-white text-slate-900 sm:rounded-2xl shadow-2xl flex flex-col min-h-dvh sm:min-h-0 sm:max-h-[92dvh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Top Header Bar (matches Screenshot 1) */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-slate-100 text-slate-700 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-tight">Business Profile</h1>
              <span className="text-[11px] text-blue-600 font-medium">Business Identity & Card</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={handleShareProfile} disabled={cardBusy} title="Share business profile details" className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50">
              {cardBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
              <span>Share Profile</span>
            </button>
            <button type="button" onClick={handleDownloadCard} disabled={cardBusy} title="Download visiting card as PNG" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold disabled:opacity-50">{cardBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{cardBusy ? 'Preparing…' : 'Download Image'}</button>
            <button type="button" onClick={handleShareCard} disabled={cardBusy} title="Share Visiting Card" className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors disabled:opacity-50">
              {cardBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Scrollable Main Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          
          {/* Card Preview Container with Theme Carousel (matches Screenshot 1) */}
          <div className="relative">
            
            {/* Theme Navigation arrows */}
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-xs font-semibold text-slate-500">
                Visiting Card Preview ({currentTheme.name})
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentThemeIdx((prev) => (prev > 0 ? prev - 1 : cardThemes.length - 1))}
                  className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentThemeIdx((prev) => (prev < cardThemes.length - 1 ? prev + 1 : 0))}
                  className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* The Actual Visiting Card */}
            <div
              ref={cardRef}
              className={`relative rounded-2xl p-5 border overflow-hidden min-h-[160px] flex flex-col justify-between transition-all ${currentTheme.cardBg}`}
            >
              {/* Background abstract watermark */}
              <div className="absolute right-0 top-0 w-36 h-36 bg-blue-500/5 rounded-bl-full pointer-events-none"></div>

              {/* Card Top Row: Company Name & Logo */}
              <div className="flex items-start justify-between gap-3 relative z-10">
                <div>
                  <h2 className={`text-lg sm:text-xl font-bold tracking-tight ${currentTheme.titleColor}`}>
                    {tradeName || 'Business Name'}
                  </h2>
                  {showGstinOnCard && gstin && (
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      GSTIN: {gstin}
                    </div>
                  )}
                  {showTypeOnCard && (
                    <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                      {businessType}
                    </span>
                  )}
                </div>

                {/* Logo Box on Card */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-12 h-12 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 overflow-hidden shrink-0 group transition-all"
                  title="Upload company logo"
                >
                  {logoBase64 ? (
                    <img src={logoBase64} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center">
                      <span className="text-xs text-blue-600 font-bold block">+</span>
                      <span className="text-[9px] text-slate-500 font-semibold uppercase leading-none">Logo</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Card Bottom Row: Details and Red Accent Line */}
              <div className="flex items-center gap-2 text-xs relative z-10 mt-3 pt-2 border-t border-slate-100/60">
                <div className={`w-1 self-stretch rounded-full ${currentTheme.accentBar} shrink-0`}></div>
                <div className="space-y-0.5 text-[11px] text-slate-600 min-w-0">
                  <div className="flex items-center gap-1.5 font-medium truncate">
                    <Phone className="w-3 h-3 text-slate-500 shrink-0" />
                    <span>{phone1 || 'Add phone number'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500 truncate">
                    <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>{email || 'Email ID'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500 truncate">
                    <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>{address || 'Business Address'}</span>
                  </div>
                </div>
              </div>

              {/* Center Floating Red Pill Button "Share Card" */}
              <div className="absolute inset-x-0 bottom-3 flex justify-center pointer-events-auto">
                <button
                  type="button"
                  onClick={handleShareCard}
                  disabled={cardBusy}
                  className={`px-5 py-1.5 rounded-full font-bold text-xs shadow-lg transition-transform hover:scale-105 active:scale-95 flex items-center gap-1.5 cursor-pointer ${currentTheme.btnBg}`}
                >
                  {cardBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
                  <span>Share Card</span>
                </button>
              </div>

            </div>

            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
            />
          </div>

          {/* Motivational Tip Bar (matches Screenshot 1) */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/60 text-amber-900 text-xs">
            <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
            <span>67% businessmen saw their business increase after sharing their visiting card</span>
          </div>

          {/* Profile Progress Bar (matches Screenshot 1) */}
          <div className="space-y-1">
            <div className="text-xs font-bold text-slate-800">
              Profile {completionPercentage}% complete.
            </div>
            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-300"
                style={{ width: `${completionPercentage}%` }}
              ></div>
            </div>
          </div>

          <div role="tablist" aria-label="Profile details" className="mb-3 grid grid-cols-2 border-b border-slate-200">
            <button type="button" role="tab" aria-selected={activeTab === 'basic'} onClick={() => setActiveTab('basic')} className={`border-b-2 px-3 py-3 text-sm font-bold transition-colors ${activeTab === 'basic' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              Basic Details
            </button>
            <button type="button" role="tab" aria-selected={activeTab === 'business'} onClick={() => setActiveTab('business')} className={`border-b-2 px-3 py-3 text-sm font-bold transition-colors ${activeTab === 'business' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              Business Details
            </button>
          </div>

          {activeTab === 'basic' && (
            <div className="space-y-3.5 pt-1 text-xs">
              
              {/* Business Name */}
              <div className="relative">
                <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Business Name</label>
                <input
                  type="text"
                  value={tradeName}
                  onChange={(e) => {
                    markDirty();
                    setTradeName(e.target.value);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* GSTIN with Show on card toggle */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1 block">GSTIN (Max 15 characters)</label>
                <input
                  type="text"
                  maxLength={15}
                  value={gstin}
                  onChange={(e) => {
                    markDirty();
                    setGstin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15));
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 uppercase"
                />
                <div className="flex items-center justify-end gap-2 mt-1">
                  <span className="text-[11px] text-slate-500">Show on card</span>
                  <input
                    type="checkbox"
                    checked={showGstinOnCard}
                    onChange={(e) => {
                      markDirty();
                      setShowGstinOnCard(e.target.checked);
                    }}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Phone Number 1 */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Phone Number 1</label>
                <input
                  type="tel"
                  value={phone1}
                  onChange={(e) => {
                    markDirty();
                    setPhone1(e.target.value);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Phone Number 2 */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Phone Number 2</label>
                <input
                  type="tel"
                  value={phone2}
                  onChange={(e) => {
                    markDirty();
                    setPhone2(e.target.value);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Email ID */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Email ID</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    markDirty();
                    setEmail(e.target.value);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Business Address */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Business Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => {
                    markDirty();
                    setAddress(e.target.value);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Pincode */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Pincode</label>
                <input
                  type="text"
                  value={pincode}
                  onChange={(e) => {
                    markDirty();
                    setPincode(e.target.value);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Business Description */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Business Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => {
                    markDirty();
                    setDescription(e.target.value);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Signature Section (matches Screenshot 2 & 4) */}
              <div className="pt-2">
                <label className="text-xs font-bold text-slate-800 mb-2 block">Signature</label>
                
                <div className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center bg-slate-50/70 flex flex-col items-center justify-center min-h-[140px]">
                  {signatureBase64 ? (
                    <div className="space-y-2">
                      <img
                        src={signatureBase64}
                        alt="Signature Preview"
                        className="max-h-20 max-w-full object-contain mx-auto"
                      />
                      <span className="text-[11px] text-emerald-600 font-medium block">
                        Signature attached to invoices
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-1">
                        <PenTool className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-semibold text-slate-700">
                        Create your signature here
                      </span>
                    </>
                  )}
                </div>

                {/* Create & Upload buttons (matches Screenshot 2 & 4) */}
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <button
                    type="button"
                    onClick={() => setIsSignatureModalOpen(true)}
                    className="py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs transition-colors cursor-pointer text-center"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => sigFileInputRef.current?.click()}
                    className="py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs transition-colors cursor-pointer text-center"
                  >
                    Upload
                  </button>
                  <input
                    type="file"
                    ref={sigFileInputRef}
                    accept="image/*"
                    onChange={handleSignatureUpload}
                    className="hidden"
                  />
                </div>
              </div>

            </div>
          )}

          {activeTab === 'business' && (
            <div className="space-y-4 border-t border-slate-200 pt-4 text-xs">
              <h3 className="text-sm font-black text-slate-800">Business Details</h3>
              
              {/* State Dropdown */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1 block">State</label>
                <select
                  value={state}
                  onChange={(e) => {
                    markDirty();
                    setState(e.target.value);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="Delhi">Delhi</option>
                  <option value="Uttar Pradesh">Uttar Pradesh</option>
                  <option value="Maharashtra">Maharashtra</option>
                  <option value="Gujarat">Gujarat</option>
                  <option value="Haryana">Haryana</option>
                  <option value="Rajasthan">Rajasthan</option>
                  <option value="Karnataka">Karnataka</option>
                  <option value="Tamil Nadu">Tamil Nadu</option>
                  <option value="West Bengal">West Bengal</option>
                  <option value="Punjab">Punjab</option>
                  <option value="Bihar">Bihar</option>
                  <option value="Madhya Pradesh">Madhya Pradesh</option>
                </select>
              </div>

              {/* Business Type Dropdown with Show on card toggle */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Business Type</label>
                <select
                  value={businessType}
                  onChange={(e) => {
                    markDirty();
                    setBusinessType(e.target.value);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="Retail">Retail</option>
                  <option value="Wholesale">Wholesale</option>
                  <option value="Distributor">Distributor</option>
                  <option value="Manufacturer">Manufacturer</option>
                  <option value="Services">Services</option>
                  <option value="Other">Other</option>
                </select>
                <div className="flex items-center justify-end gap-2 mt-1">
                  <span className="text-[11px] text-slate-500">Show on card</span>
                  <input
                    type="checkbox"
                    checked={showTypeOnCard}
                    onChange={(e) => {
                      markDirty();
                      setShowTypeOnCard(e.target.checked);
                    }}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Business Category Dropdown with Show on card toggle */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Business Category</label>
                <select
                  value={businessCategory}
                  onChange={(e) => {
                    markDirty();
                    setBusinessCategory(e.target.value);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="Hardware & Tools">Hardware & Tools</option>
                  <option value="Electronics & Mobile">Electronics & Mobile</option>
                  <option value="Grocery & FMCG">Grocery & FMCG</option>
                  <option value="Textiles & Garments">Textiles & Garments</option>
                  <option value="Pharma & Medical">Pharma & Medical</option>
                  <option value="Automobile & Spare Parts">Automobile & Spare Parts</option>
                  <option value="Professional & Tax Compliance">Professional & Tax Compliance</option>
                  <option value="Other">Other</option>
                </select>
                <div className="flex items-center justify-end gap-2 mt-1">
                  <span className="text-[11px] text-slate-500">Show on card</span>
                  <input
                    type="checkbox"
                    checked={showCategoryOnCard}
                    onChange={(e) => {
                      markDirty();
                      setShowCategoryOnCard(e.target.checked);
                    }}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Books Beginning Date */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Books Beginning Date</label>
                <input
                  type="date"
                  value={booksBeginningDate}
                  onChange={(e) => {
                    markDirty();
                    setBooksBeginningDate(e.target.value);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Dynamic Opening Capital Balance Parameter (Part 2 requirement) */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1 block">
                  Enter Opening Capital Balance (Retained Prior Year Capital)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 font-semibold text-sm">₹</span>
                  <IndianAmountInput
                    step="0.01"
                    min="0"
                    value={openingCapital}
                    onValueChange={(value) => {
                      markDirty();
                      setOpeningCapital(value);
                    }}
                    className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Optional: If new business or starting fresh, leave as 0.00.
                </p>
              </div>

            </div>
          )}

        </div>

        {/* Bottom Sticky Action Bar: Cancel and Blue Save Button */}
        <div className="border-t border-slate-200 bg-white px-4 py-3 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 text-center text-sm font-semibold text-slate-600 hover:text-slate-900 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSubmit}
            className="flex-1 py-3 text-center text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-lg shadow-blue-600/25 disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>

      </div>

      {/* Full-Screen Signature Drawing Canvas Modal */}
      {isSignatureModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/85 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <span className="font-bold text-sm text-slate-800">Draw Your Signature</span>
              <button
                type="button"
                onClick={() => setIsSignatureModalOpen(false)}
                className="p-1 rounded text-slate-500 hover:text-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-50">
              <div className="border-2 border-dashed border-slate-300 rounded-xl bg-white overflow-hidden touch-none h-64 w-full relative">
                <canvas
                  ref={canvasRef}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full h-full cursor-crosshair"
                />
                <span className="absolute bottom-2 left-2 text-[10px] text-slate-400 select-none">
                  Sign above using mouse or finger
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 border-t border-slate-200 bg-white">
              <button
                type="button"
                onClick={clearCanvas}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Clear
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsSignatureModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveSignature}
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 cursor-pointer shadow-md shadow-blue-600/20"
                >
                  Apply Signature
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share Toast */}
      {shareToast && (
        <div className="fixed bottom-6 right-6 z-60 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs border border-slate-700">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{cardStatus || 'Business card image action completed.'}</span>
        </div>
      )}

    </div>
  );
};

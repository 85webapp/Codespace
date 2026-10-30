import React, { useState } from 'react';
import {
  X,
  Link2,
  Copy,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  LockKeyhole,
  Building2,
  FileText,
  ShieldAlert,
  Globe2,
  BriefcaseBusiness,
} from 'lucide-react';
import { apiFetch } from '../utils/api';
import { User as UserType } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: UserType | null;
  onAdminLogin?: () => void;
}

const SectionTitle: React.FC<{ icon: React.ReactNode; title: string; subtitle?: string }> = ({
  icon,
  title,
  subtitle,
}) => (
  <div className="mb-4 flex items-start gap-3">
    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
      {icon}
    </div>
    <div className="min-w-0">
      <h3 className="text-base font-extrabold leading-snug text-slate-900 sm:text-lg">{title}</h3>
      {subtitle && <p className="mt-1 text-sm font-medium text-blue-700">{subtitle}</p>}
    </div>
  </div>
);

const Feature: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <li className="mb-3">
    <span className="font-bold text-slate-900">{title}: </span>
    <span className="text-slate-600">{children}</span>
  </li>
);

export const AboutUsModal: React.FC<Props> = ({ isOpen, onClose, onAdminLogin }) => {
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const generateCashierLink = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/cashier/link', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not generate link');
      setLink(data.link);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate link');
    } finally {
      setLoading(false);
    }
  };

  const copyCashierLink = async () => {
    try {
      await navigator.clipboard?.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Unable to copy the link. Please copy it manually.');
    }
  };

  const openAdminLogin = () => {
    onClose();
    onAdminLogin?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2 sm:p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-us-title"
        className="flex max-h-[96dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[92dvh] sm:rounded-3xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-7 sm:py-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 id="about-us-title" className="text-lg font-black tracking-tight text-slate-950 sm:text-xl">
                About Us
              </h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500 sm:text-sm">
                Quadtrix Tax &amp; Compliance Group
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close About Us"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-7 sm:py-7">
          <div className="mb-7 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5 sm:p-7">
            <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.16em] text-blue-700">1. Welcome to Quadtrix Tax &amp; Compliance Group</p>
            <h1 className="text-2xl font-black leading-tight tracking-tight text-slate-950 sm:text-3xl">
              Quadtrix Tax &amp; Compliance Group
            </h1>
            <p className="mt-3 text-base font-bold leading-relaxed text-blue-800 sm:text-lg">
              Empowering Small Businesses through Smart Financial &amp; Compliance Automation
            </p>
            <p className="mt-4 text-sm leading-7 text-slate-700 sm:text-[15px]">
              Welcome to Quadtrix Tax &amp; Compliance Group, a premier business automation and regulatory compliance advisory firm. Established in the strategic heartland of Uttar Pradesh, our organization is dedicated to empowering micro, small, and medium enterprises (MSMEs), startups, and independent business owners across India (Pan-India) with seamless, highly reliable, and modern digital tools.
            </p>
            <p className="mt-3 text-sm leading-7 text-slate-700 sm:text-[15px]">
              In today&apos;s fast-evolving business landscape, traditional ledgers, manual book-keeping, and outdated spreadsheet management are no longer sufficient. As the Indian economy rapidly digitizes, maintaining accurate billing, real-time inventory, and strict statutory compliance has become vital for long-term growth and stability. Quadtrix Tax &amp; Compliance Group stands at the forefront of this digital transformation, serving not merely as a service provider, but as a trusted operational partner for your everyday business workflow.
            </p>
          </div>

          <section className="mb-8 border-b border-slate-100 pb-7">
            <SectionTitle
              icon={<FileText className="h-5 w-5" />}
              title="2. Our Core Product: Next-Gen Billing & Accounting Platform"
              subtitle="A Modern, Secure, and Intuitive Alternative to Legacy Accounting Systems"
            />
            <p className="mb-4 text-sm leading-7 text-slate-700 sm:text-[15px]">
              Designed specifically to address the daily operational challenges of Indian traders, retailers, and service providers, the Quadtrix Billing &amp; Accounting Application provides a streamlined, user-friendly alternative to traditional legacy software like Vyapar, Tally, and Busy.
            </p>
            <h4 className="mb-3 text-sm font-extrabold text-slate-900">Key Capabilities of Our Application</h4>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-7 marker:text-blue-600 sm:text-[15px]">
              <Feature title="Instant GST & Non-GST Invoicing">Generate professional invoices, quotations, proforma bills, delivery challans, and credit/debit notes within seconds and share them instantly via WhatsApp or Email.</Feature>
              <Feature title="Smart Inventory & Stock Management">Track inventory movements in real time with automated low-stock notifications to ensure uninterrupted supply chain operations.</Feature>
              <Feature title="Receivables & Payables Tracking">Maintain precise records of outstanding dues, customer ledgers, and vendor payables while automating payment reminder workflows to maintain healthy cash flow.</Feature>
              <Feature title="GSTR-Ready Data Generation">Export structured, accurate GSTR-1, GSTR-3B, and B2B/B2C summaries at the click of a button, simplifying period-end tax filings for you and your accounting team.</Feature>
              <Feature title="Encrypted Cloud Infrastructure">Protect your sensitive business data with secure cloud backups, ensuring business continuity without fear of localized system failures.</Feature>
            </ul>
          </section>

          <section className="mb-8 border-b border-slate-100 pb-7">
            <SectionTitle
              icon={<ShieldAlert className="h-5 w-5" />}
              title="3. Customer Scope & Mandatory Eligibility Criteria"
              subtitle="Important Notice regarding Target Audience and Platform Suitability"
            />
            <p className="mb-4 text-sm leading-7 text-slate-700 sm:text-[15px]">
              Quadtrix Tax &amp; Compliance Group operates on a foundation of operational transparency. Our platform and standardized digital utilities are customized for small and emerging businesses that require agile, self-managed accounting solutions.
            </p>
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
              <p className="text-sm leading-7 text-slate-700"><strong className="text-slate-900">Target Micro &amp; Small Enterprises: </strong>Our self-service billing application and standard compliance packages are specifically tailored for businesses with an annual turnover below ₹2 Crores.</p>
              <p className="text-sm leading-7 text-slate-700"><strong className="text-slate-900">Non-Audit Entities Only: </strong>This platform is engineered exclusively for sole proprietorships, partnerships, and small business entities that are not subject to mandatory statutory audits under the Income Tax Act or Goods and Services Tax (GST) statutes.</p>
              <p className="text-sm leading-7 text-rose-800"><strong>Mandatory Disqualification Notice: </strong>If your business entity, firm, or company falls within the scope of mandatory statutory tax audits under applicable Indian legislation, you are strictly advised that this self-service platform is not intended for your operations. Entities falling under audit mandates should immediately exit this workflow and seek individual, dedicated consultation from a qualified Chartered Accountant or statutory auditor.</p>
            </div>
          </section>

          <section className="mb-8 border-b border-slate-100 pb-7">
            <SectionTitle
              icon={<BriefcaseBusiness className="h-5 w-5" />}
              title="4. End-to-End Business & Advisory Services"
              subtitle="A Comprehensive Ecosystem for Your Corporate and Financial Growth"
            />
            <p className="mb-5 text-sm leading-7 text-slate-700 sm:text-[15px]">
              Quadtrix Tax &amp; Compliance Group offers a comprehensive suite of professional solutions designed to support your enterprise throughout every stage of its lifecycle:
            </p>
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 p-4">
                <h4 className="mb-2 font-extrabold text-slate-900">1. Goods &amp; Services Tax (GST) Advisory</h4>
                <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600 marker:text-blue-600">
                  <li>New GST Registrations across all business categories.</li>
                  <li>Monthly, Quarterly, and Annual Return Filings (GSTR-1, GSTR-3B, CMP-08).</li>
                  <li>GST Modifications, Cancellations, Revocation procedures, and Notice Responses.</li>
                  <li>E-Way Bill generation setup and automated E-Invoicing integrations.</li>
                </ul>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <h4 className="mb-2 font-extrabold text-slate-900">2. Direct Taxation &amp; Income Tax Returns</h4>
                <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600 marker:text-blue-600">
                  <li>Income Tax Return (ITR-1, ITR-2, ITR-3, ITR-4) filing for individuals, firms, and small businesses.</li>
                  <li>Tax planning, advance tax calculations, and TDS/TCS compliance.</li>
                  <li>Financial statement drafting and income computation reports.</li>
                </ul>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <h4 className="mb-2 font-extrabold text-slate-900">3. Commercial Insurance &amp; Risk Mitigation</h4>
                <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600 marker:text-blue-600">
                  <li>Shopkeeper, commercial property, and warehouse inventory insurance coverage.</li>
                  <li>Group health, keyman, and term life insurance solutions.</li>
                  <li>Transit and commercial vehicle insurance policies.</li>
                </ul>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <h4 className="mb-2 font-extrabold text-slate-900">4. Loan Documentation &amp; Financial Project Reports</h4>
                <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600 marker:text-blue-600">
                  <li>Compilation of bank credit files for MSME, business, and working capital loans.</li>
                  <li>Preparation of detailed Project Reports, CMA Data worksheets, and provisional balance sheets.</li>
                  <li>Official Udyam MSME Registration and government scheme/subsidy guidance.</li>
                </ul>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <h4 className="mb-2 font-extrabold text-slate-900">5. Web Development &amp; Digital Engineering Solutions</h4>
                <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600 marker:text-blue-600">
                  <li>Custom corporate and e-commerce website development.</li>
                  <li>Web application development, API integrations, and liquid theme customizations.</li>
                  <li>Digital brand engineering, online presence management, and continuous technical support.</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="mb-8 border-b border-slate-100 pb-7">
            <SectionTitle
              icon={<Globe2 className="h-5 w-5" />}
              title="5. Origin and Pan-India Operational Footprint"
              subtitle="Rooted in Uttar Pradesh — Serving Enterprises Nationwide"
            />
            <p className="text-sm leading-7 text-slate-700 sm:text-[15px]">
              Quadtrix Tax &amp; Compliance Group was established to leverage the vibrant economic energy of Uttar Pradesh. From our strategic regional operations, we have scaled our digital delivery capabilities to extend services across all states and union territories throughout India (Pan-India).
            </p>
            <p className="mt-3 text-sm leading-7 text-slate-700 sm:text-[15px]">
              Through our centralized cloud architecture, online registration portals, and dedicated remote support teams, geography poses no barrier. Businesses nationwide can onboard, manage billing operations, and execute corporate compliances seamlessly from any device, anywhere in the country.
            </p>
          </section>

          <section className="mb-8 border-b border-slate-100 pb-7">
            <SectionTitle
              icon={<ShieldCheck className="h-5 w-5" />}
              title="6. Terms of Operation, Limitation of Liability & Statutory Legal Disclaimer"
              subtitle="Standard Terms of Service, Technical Disclaimer, and Comprehensive Liability Exemption"
            />
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-extrabold leading-6 text-amber-900">
              PLEASE READ THIS SECTION CAREFULLY. CONTINUED ACCESS TO OR USE OF THIS WEBSITE, APPLICATION, AND ASSOCIATED ADVISORY SERVICES CONSTITUTES EXPRESS ACCEPTANCE OF THE TERMS SET FORTH BELOW.
            </div>
            <div className="space-y-5 text-sm leading-7 text-slate-700 sm:text-[15px]">
              <div>
                <h4 className="mb-2 font-extrabold text-slate-900">6.1. Software Provisioning &amp; Technical Disclaimers</h4>
                <p>The digital applications, web interfaces, and automated billing instruments provided by Quadtrix Tax &amp; Compliance Group are provided strictly on an &quot;AS-IS&quot; and &quot;AS-AVAILABLE&quot; basis without warranties of any kind, whether express, implied, or statutory. While reasonable measures are employed to ensure continuous server uptime and operational stability, the Company explicitly disclaims any warranty that software operations will remain uninterrupted, error-free, immune to latency, or entirely compatible with third-party operating hardware. Under no circumstances shall the Company be held liable for system downtime, internet packet loss, cloud server disconnections, database corruption, or localized hardware failures.</p>
              </div>
              <div>
                <h4 className="mb-2 font-extrabold text-slate-900">6.2. Statutory Tax and Regulatory Responsibility</h4>
                <p>This software functions purely as an administrative computational utility and data aggregation interface. The ultimate responsibility for verification, data integrity, HSN/SAC code selection, applicability of GST rates, turnover calculations, and compliance deadlines rests solely and exclusively upon the registered user.</p>
                <p className="mt-3">Quadtrix Tax &amp; Compliance Group, its directors, developers, sub-contractors, and affiliates accept no legal or financial liability for any statutory penalties, late filing fees, interest levies, tax demands, or notices issued by sovereign tax authorities (including but not limited to the GST Department, Income Tax Department, CBDT, CBIC, or local municipal bodies) resulting from inaccurate user inputs, system misinterpretation, or regulatory modifications.</p>
              </div>
              <div>
                <h4 className="mb-2 font-extrabold uppercase text-slate-900">6.3. Comprehensive Limitation of Liability, Force Majeure, and Indemnification Obligations</h4>
                <p className="mb-3 font-extrabold text-slate-900">STRICT LIMITATION OF LIABILITY, FORCE MAJEURE AND INDEMNIFICATION OBLIGATIONS:</p>
                <p>By accessing, downloading, registering, deploying, or otherwise utilizing the services, software applications, websites, or advisory infrastructure provided by Quadtrix Tax &amp; Compliance Group (&quot;The Entity&quot;), the user (&quot;Licensee/Client&quot;) hereby explicitly acknowledges, comprehends, and agrees that The Entity operates strictly as an intermediary digital enabler and technological interface.</p>
                <p className="mt-3">Under no circumstances—including but not limited to negligence, system latency, algorithmic discrepancy, structural data corruption, unauthorized third-party intrusion, cybernetic security breaches, regulatory non-compliance, statutory audit rejections, misinterpretation of fiscal statutes, or administrative penalties imposed by sovereign tax authorities—shall The Entity, its founders, associates, technological partners, or legal affiliates be held liable for any direct, indirect, incidental, consequential, special, punitive, or exemplary damages, including loss of accrued profits, business interruption, loss of operational data, or reputational impairment arising out of or in connection with the use or inability to use the software or services.</p>
                <p className="mt-3">The entire onus of verifying statutory calculations, compliance accuracy, audit applicability, and regulatory conformity rests solely upon the user. The user expressly agrees to defend, indemnify, and hold harmless The Entity from and against any and all liabilities, claims, actions, demands, losses, damages, fines, penalties, costs, and expenses (including reasonable attorneys&apos; fees and administrative litigation costs) resulting from or arising out of user&apos;s input errors, fraudulent reporting, unauthorized audit participation, or statutory default.</p>
                <p className="mt-3">Services are subject to force majeure conditions, including statutory amendments, government portal downtimes (e.g., GSTN/ITR portal technical glitches), telecom failures, and acts of state. Continued use of this platform constitutes absolute and irrevocable acceptance of these transactional limitations and operational risk assignments.</p>
              </div>
            </div>
          </section>

          <section className="mb-8 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm"><Link2 className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <h3 className="font-extrabold text-slate-900">Cashier Access Link</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">The link contains only your owner identity. It does not contain your password and does not grant access until you approve a cashier request.</p>
              </div>
            </div>
            {error && <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={generateCashierLink} disabled={loading} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                {link ? 'Generate New Link' : 'Get Cashier Link'}
              </button>
              {link && <button type="button" onClick={copyCashierLink} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
                {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy Link'}
              </button>}
            </div>
            {link && <div className="mt-3 break-all rounded-xl border border-slate-200 bg-white p-3 font-mono text-xs leading-5 text-slate-700">{link}</div>}
            <p className="mt-3 text-xs leading-5 text-slate-500">Generating a new link immediately makes the previous link unusable.</p>
          </section>

          <footer className="mt-8 border-t border-slate-200 pt-6 text-center">
            <p className="mb-3 text-xs font-medium text-slate-500">Authorized administrators only</p>
            <button
              type="button"
              onClick={openAdminLogin}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-5 py-3 text-sm font-extrabold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <LockKeyhole className="h-4 w-4" />
              Admin Login
            </button>
          </footer>
        </div>
      </section>
    </div>
  );
};

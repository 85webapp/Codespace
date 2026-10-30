// Display-layer localisation. Stored data never changes; only what is shown.
// 1) Hindi translation when language = 'hi'
// 2) Currency symbol swap when currency is not ₹
// 3) Date display format for stored DD/MM/YYYY dates
import { getLocale, subscribeLocale, reformatDmy } from './locale';
// Display-layer Hindi translations for common navigation, actions, forms and status text.
const hindi: Record<string, string> = {
  'Home': 'होम',
  'Dashboard': 'डैशबोर्ड',
  'Menu': 'मेन्यू',
  'Settings': 'सेटिंग्स',
  'General': 'सामान्य',
  'Save Settings': 'सेटिंग्स सेव करें',
  'Save': 'सेव करें',
  'Cancel': 'रद्द करें',
  'Close': 'बंद करें',
  'Back': 'वापस',
  'Next': 'आगे',
  'Previous': 'पिछला',
  'Search': 'खोजें',
  'Apply Filter': 'फ़िल्टर लागू करें',
  'Refresh': 'रिफ्रेश करें',
  'Loading…': 'लोड हो रहा है…',
  'No records found.': 'कोई रिकॉर्ड नहीं मिला।',
  'Edit Records': 'रिकॉर्ड संपादित करें',
  'Delete Records': 'रिकॉर्ड हटाएँ',
  'Save changes': 'बदलाव सेव करें',
  'Date': 'तारीख',
  'Amount': 'राशि',
  'Total': 'कुल',
  'Subtotal': 'उप-योग',
  'Sales': 'बिक्री',
  'Sales / Invoices': 'बिक्री / इनवॉइस',
  'Purchases': 'खरीद',
  'Expenses': 'खर्च',
  'Payments': 'भुगतान',
  'Parties': 'पार्टी',
  'Customer': 'ग्राहक',
  'Supplier': 'सप्लायर',
  'Customer / party name': 'ग्राहक / पार्टी का नाम',
  'Party phone': 'पार्टी का मोबाइल नंबर',
  'Supplier name': 'सप्लायर का नाम',
  'Supplier GSTIN': 'सप्लायर GSTIN',
  'Supplier mobile': 'सप्लायर मोबाइल नंबर',
  'Customer GSTIN': 'ग्राहक GSTIN',
  'Customer address': 'ग्राहक का पता',
  'Monetary, GST and item values are protected to avoid corrupting linked accounting and stock records.': 'लेखा और स्टॉक रिकॉर्ड सुरक्षित रखने के लिए राशि, GST और आइटम की जानकारी यहाँ संपादित नहीं की जा सकती।',
  'Date must use YYYY-MM-DD.': 'तारीख YYYY-MM-DD प्रारूप में होनी चाहिए।',
  'That record number is already in use.': 'यह रिकॉर्ड नंबर पहले से उपयोग में है।',
  'Submit Previous Day Store Report': 'पिछले दिन की दुकान रिपोर्ट जमा करें',
  'GSTIN': 'GSTIN',
  'Mobile Number': 'मोबाइल नंबर',
  'Invoice number': 'इनवॉइस नंबर',
  'Supplier invoice number': 'सप्लायर इनवॉइस नंबर',
  'Expense number': 'खर्च नंबर',
  'Expense title': 'खर्च का शीर्षक',
  'Category': 'श्रेणी',
  'Paid to': 'किसे भुगतान किया',
  'Notes': 'नोट्स',
  'Search number, party or title': 'नंबर, पार्टी या शीर्षक खोजें',
  'Record': 'रिकॉर्ड',
  'No invoices recorded yet. Click "Add New Sale" to generate one.': 'अभी कोई इनवॉइस दर्ज नहीं है। नया इनवॉइस बनाने के लिए “नई बिक्री जोड़ें” चुनें।',
  'Add New Sale': 'नई बिक्री जोड़ें',
  'Add New Party': 'नई पार्टी जोड़ें',
  'View All': 'सभी देखें',
  'About Us': 'हमारे बारे में',
  'Display Language': 'डिस्प्ले भाषा',
  'English': 'अंग्रेज़ी',
  'Hindi': 'हिंदी',
  'हिन्दी (Hindi)': 'हिंदी',
  'Active Currency': 'मुद्रा',
  'Invoice Print': 'इनवॉइस प्रिंट',
  'Grant Permission': 'अनुमति दें',
  'Cashier Link & Access': 'कैशियर लिंक और एक्सेस',
  'Create and manage cashier access for this business.': 'इस व्यवसाय के लिए कैशियर एक्सेस बनाएँ और प्रबंधित करें।',
  'Basic Details': 'बुनियादी जानकारी',
  'Business Details': 'व्यवसाय की जानकारी',
  'Profile': 'प्रोफ़ाइल',
  'Login': 'लॉगिन',
  'Register': 'रजिस्टर करें',
  'Logout': 'लॉगआउट',
  'Password': 'पासवर्ड',
  'Email': 'ईमेल',
  'Name': 'नाम',
  'Phone': 'फोन',
  'Address': 'पता',
  'Save & Generate Invoice': 'सेव करें और इनवॉइस बनाएँ',
  'Create Tax Invoice / Cash Memo': 'टैक्स इनवॉइस / कैश मेमो बनाएँ',
  'Tax Invoice (B2B)': 'टैक्स इनवॉइस (B2B)',
  'Cash Memo (B2C Retail)': 'कैश मेमो (B2C रिटेल)',
  'Party & Customer Details': 'पार्टी और ग्राहक की जानकारी',
  'Place of Supply': 'आपूर्ति का स्थान',
  'Add Item': 'आइटम जोड़ें',
  'Item Description': 'आइटम का विवरण',
  'Qty': 'मात्रा',
  'Unit': 'इकाई',
  'Rate (₹)': 'दर (₹)',
  'GST %': 'GST %',
  'Taxable Amount': 'कर योग्य राशि',
  'Payment Mode': 'भुगतान का तरीका',
  'Cash': 'नकद',
  'Bank': 'बैंक',
  'Online': 'ऑनलाइन',
  'Daily Report': 'दैनिक रिपोर्ट',
  'Submit Closing Report': 'क्लोज़िंग रिपोर्ट जमा करें',
  'Report updated successfully': 'रिपोर्ट सफलतापूर्वक अपडेट हुई',
  'Success': 'सफल',
  'Error': 'त्रुटि',
  'Delete': 'हटाएँ',
  'Edit': 'संपादित करें',
  'Download': 'डाउनलोड',
  'Share': 'शेयर करें',
  'Print': 'प्रिंट करें',
  'Yes': 'हाँ',
  'No': 'नहीं',
  'Confirm': 'पुष्टि करें',
  'Notifications': 'सूचनाएँ',
  'Sound & Haptics': 'साउंड और वाइब्रेशन',
  'Master Sound': 'मुख्य साउंड',
  'Master Haptic / Vibration': 'मुख्य हैप्टिक / वाइब्रेशन',
  'Financial Year': 'वित्तीय वर्ष',
  'Date Format': 'तारीख का फ़ॉर्मेट',
  'Currency': 'मुद्रा',
  'Cashier Asset Requests': 'कैशियर अनुरोध',
  'Request Record Change': 'रिकॉर्ड बदलने का अनुरोध',
  'Submit for Owner Approval': 'मालिक की मंज़ूरी के लिए भेजें',
};

const originals = new WeakMap<Text, string>();
const lastOutput = new WeakMap<Text, string>();

function transform(text: string): string {
  const { currency, dateFormat, language } = getLocale();
  let out = text;
  if (language === 'hi') out = hindi[out.trim()] ?? out;
  if (currency && currency !== '₹') out = out.split('₹').join(currency);
  if (dateFormat && dateFormat !== 'DD/MM/YYYY') {
    out = out.replace(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g, (_m, d, m, y) => reformatDmy(d, m, y, dateFormat));
  }
  return out;
}

function processTextNode(node: Text) {
  const current = node.nodeValue || '';
  let base: string;
  if (originals.has(node) && lastOutput.get(node) === current) {
    base = originals.get(node)!; // unchanged since we last wrote it
  } else {
    base = current; // new text written by React
  }
  originals.set(node, base);
  const next = transform(base);
  lastOutput.set(node, next);
  if (next !== current) node.nodeValue = next;
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    processTextNode(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const tag = (root as Element).tagName;
  if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) nodes.push(n as Text);
  nodes.forEach(processTextNode);
}

let started = false;

export function startLocalisation() {
  if (started || typeof document === 'undefined') return;
  started = true;

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'characterData') {
        processTextNode(m.target as Text);
      } else {
        m.addedNodes.forEach((n) => walk(n));
      }
    }
  });

  const begin = () => {
    walk(document.body);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  if (document.body) begin();
  else document.addEventListener('DOMContentLoaded', begin);

  // Re-run over the whole page when language, currency or date format changes
  subscribeLocale(() => walk(document.body));
}

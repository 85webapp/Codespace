/**
 * Utility to convert numbers to Indian Currency Words
 * e.g., 14160 -> "Fourteen Thousand One Hundred and Sixty Rupees only"
 */
export function numberToIndianWords(amount: number): string {
  if (isNaN(amount) || amount === 0) return 'Zero Rupees only';

  const singleDigits = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  ];
  const teens = [
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const tens = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
  ];

  function convertTwoDigits(n: number): string {
    if (n < 10) return singleDigits[n];
    if (n >= 10 && n < 20) return teens[n - 10];
    const unit = n % 10;
    const ten = Math.floor(n / 10);
    return tens[ten] + (unit > 0 ? ' ' + singleDigits[unit] : '');
  }

  function convertThreeDigits(n: number): string {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    let res = '';
    if (hundred > 0) {
      res += singleDigits[hundred] + ' Hundred';
      if (rest > 0) res += ' and ';
    }
    if (rest > 0) {
      res += convertTwoDigits(rest);
    }
    return res;
  }

  const rounded = Math.round(amount);
  let n = rounded;

  const crore = Math.floor(n / 10000000);
  n %= 10000000;

  const lakh = Math.floor(n / 100000);
  n %= 100000;

  const thousand = Math.floor(n / 1000);
  n %= 1000;

  const hundredAndBelow = n;

  const parts: string[] = [];

  if (crore > 0) {
    parts.push(convertTwoDigits(crore) + ' Crore');
  }
  if (lakh > 0) {
    parts.push(convertTwoDigits(lakh) + ' Lakh');
  }
  if (thousand > 0) {
    parts.push(convertTwoDigits(thousand) + ' Thousand');
  }
  if (hundredAndBelow > 0) {
    parts.push(convertThreeDigits(hundredAndBelow));
  }

  return (parts.join(' ') || 'Zero') + ' Rupees only';
}

/**
 * International (million / billion) wording, e.g. 1250000 -> "One Million Two Hundred Fifty Thousand Rupees only"
 */
export function numberToInternationalWords(amount: number): string {
  if (isNaN(amount) || Math.round(amount) === 0) return 'Zero Rupees only';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const below1000 = (n: number): string => {
    const parts: string[] = [];
    if (n >= 100) {
      parts.push(ones[Math.floor(n / 100)] + ' Hundred');
      n %= 100;
    }
    if (n >= 20) {
      parts.push(tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : ''));
    } else if (n > 0) {
      parts.push(ones[n]);
    }
    return parts.join(' ');
  };
  let n = Math.abs(Math.round(amount));
  const units: [number, string][] = [[1_000_000_000, 'Billion'], [1_000_000, 'Million'], [1_000, 'Thousand']];
  const out: string[] = [];
  for (const [size, label] of units) {
    if (n >= size) {
      out.push(below1000(Math.floor(n / size)) + ' ' + label);
      n %= size;
    }
  }
  if (n > 0) out.push(below1000(n));
  return out.join(' ') + ' Rupees only';
}

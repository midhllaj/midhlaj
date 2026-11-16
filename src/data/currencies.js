/**
 * Currencies offered in the contact form's budget picker, in display order.
 * `rate` = roughly how many units equal 1 US dollar. Only used to turn the USD budget
 * tiers into round local figures, so approximate is fine; update now and then.
 * Budgets set by hand in config.js (site.budgets.fixed) win over these conversions.
 */
export const currencyGroups = [
  {
    label: 'Main',
    items: [
      ['USD', 'US dollar', 1],
      ['INR', 'Indian rupee', 88],
    ],
  },
  {
    label: 'Arab currencies',
    items: [
      ['AED', 'UAE dirham', 3.67],
      ['SAR', 'Saudi riyal', 3.75],
      ['QAR', 'Qatari riyal', 3.64],
      ['KWD', 'Kuwaiti dinar', 0.307],
      ['BHD', 'Bahraini dinar', 0.376],
      ['OMR', 'Omani rial', 0.385],
      ['JOD', 'Jordanian dinar', 0.709],
      ['EGP', 'Egyptian pound', 48],
      ['MAD', 'Moroccan dirham', 9.2],
      ['DZD', 'Algerian dinar', 130],
      ['TND', 'Tunisian dinar', 2.95],
      ['IQD', 'Iraqi dinar', 1310],
    ],
  },
  {
    label: 'Other currencies',
    items: [
      ['EUR', 'Euro', 0.86],
      ['GBP', 'British pound', 0.76],
      ['CAD', 'Canadian dollar', 1.4],
      ['AUD', 'Australian dollar', 1.53],
      ['NZD', 'New Zealand dollar', 1.75],
      ['CHF', 'Swiss franc', 0.8],
      ['SGD', 'Singapore dollar', 1.3],
      ['HKD', 'Hong Kong dollar', 7.78],
      ['JPY', 'Japanese yen', 152],
      ['CNY', 'Chinese yuan', 7.1],
      ['KRW', 'South Korean won', 1430],
      ['TWD', 'New Taiwan dollar', 30.5],
      ['MYR', 'Malaysian ringgit', 4.2],
      ['IDR', 'Indonesian rupiah', 16500],
      ['PHP', 'Philippine peso', 58],
      ['THB', 'Thai baht', 32.5],
      ['VND', 'Vietnamese dong', 26300],
      ['PKR', 'Pakistani rupee', 281],
      ['BDT', 'Bangladeshi taka', 122],
      ['LKR', 'Sri Lankan rupee', 300],
      ['NPR', 'Nepalese rupee', 141],
      ['TRY', 'Turkish lira', 42],
      ['ILS', 'Israeli shekel', 3.3],
      ['ZAR', 'South African rand', 17.4],
      ['NGN', 'Nigerian naira', 1460],
      ['KES', 'Kenyan shilling', 129],
      ['GHS', 'Ghanaian cedi', 11.5],
      ['BRL', 'Brazilian real', 5.4],
      ['MXN', 'Mexican peso', 18.4],
      ['CLP', 'Chilean peso', 940],
      ['COP', 'Colombian peso', 3900],
      ['SEK', 'Swedish krona', 9.5],
      ['NOK', 'Norwegian krone', 10.1],
      ['DKK', 'Danish krone', 6.4],
      ['PLN', 'Polish złoty', 3.65],
      ['CZK', 'Czech koruna', 21],
      ['HUF', 'Hungarian forint', 335],
      ['RUB', 'Russian ruble', 80],
      ['UAH', 'Ukrainian hryvnia', 41.5],
    ],
  },
];

const rates = Object.fromEntries(currencyGroups.flatMap((g) => g.items.map(([code, , rate]) => [code, rate])));

/** Round to a figure people actually quote: 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8 × 10ⁿ. */
const nice = (v) => {
  const mag = 10 ** Math.floor(Math.log10(v));
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10];
  const n = v / mag;
  return steps.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best)) * mag;
};

const format = (code, v) =>
  new Intl.NumberFormat(code === 'INR' ? 'en-IN' : 'en', {
    style: 'currency',
    currency: code,
    currencyDisplay: 'symbol', // "CA$", "MX$", "HK$"… so dollars never get mixed up
    minimumFractionDigits: 0,
    maximumFractionDigits: v >= 1000 ? 1 : 0,
    notation: v >= 1000 ? 'compact' : 'standard',
  }).format(v);

/** The budget chips for one currency, e.g. ['Under $500', '$500 – $1,000', …]. */
export function budgetTiers(code, { usd, fixed = {} }) {
  const tiers = fixed[code] || usd.map((v) => (code === 'USD' ? v : nice(v * rates[code])));
  const f = (v) => format(code, v);
  return [`Under ${f(tiers[0])}`, ...tiers.slice(1).map((v, i) => `${f(tiers[i])} – ${f(v)}`), `${f(tiers[tiers.length - 1])}+`];
}

// SEC EDGAR proxy — fetches quarterly financial data for a ticker
// Uses https://data.sec.gov (free, no API key required)

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const UA = 'SM-Investments-Portal/1.0 (research@sminvestments.com)';

// Maps our row keys to ordered lists of XBRL concept names to try
const CONCEPT_MAP = {
  totalRevenue: [
    'Revenues',
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'RevenueFromContractWithCustomerIncludingAssessedTax',
    'SalesRevenueNet',
    'RevenuesNetOfInterestExpense',
  ],
  automotiveRevenue: [
    'AutomotiveSalesRevenue',
    'ProductRevenue',
    'SalesRevenueGoodsNet',
  ],
  servicesRevenue: [
    'ServiceRevenue',
    'RevenueFromContractWithCustomerExcludingAssessedTaxServices',
    'ServicesRevenue',
  ],
  costOfRevenue: [
    'CostOfRevenue',
    'CostOfGoodsAndServicesSold',
    'CostOfGoodsSoldAndServicesSold',
    'CostOfGoodsSold',
  ],
  automotiveCOGS: [
    'CostOfAutomotiveRevenue',
    'CostOfProductsSold',
  ],
  servicesCOGS: [
    'CostOfServices',
  ],
  grossProfit: [
    'GrossProfit',
  ],
  researchAndDevelopment: [
    'ResearchAndDevelopmentExpense',
    'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost',
  ],
  sellingGeneralAdministrative: [
    'SellingGeneralAndAdministrativeExpense',
    'GeneralAndAdministrativeExpense',
  ],
  operatingExpenses: [
    'OperatingExpenses',
    'CostsAndExpenses',
  ],
  operatingIncome: [
    'OperatingIncomeLoss',
  ],
  interestIncome: [
    'InvestmentIncomeInterest',
    'InterestAndDividendIncomeOperating',
    'InterestIncomeOperating',
  ],
  interestExpense: [
    'InterestExpense',
    'InterestAndDebtExpense',
  ],
  pretaxIncome: [
    'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
    'IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic',
  ],
  incomeTax: [
    'IncomeTaxExpenseBenefit',
  ],
  netIncome: [
    'NetIncomeLoss',
    'NetIncomeLossAvailableToCommonStockholdersBasic',
    'ProfitLoss',
  ],
  epsBasic: [
    'EarningsPerShareBasic',
  ],
  epsDiluted: [
    'EarningsPerShareDiluted',
  ],
  sharesOutstanding: [
    'WeightedAverageNumberOfSharesOutstandingBasic',
    'CommonStockSharesOutstanding',
  ],
};

async function getCIK(ticker) {
  const resp = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': UA },
  });
  if (!resp.ok) throw new Error('SEC ticker lookup failed');
  const data = await resp.json();
  const entry = Object.values(data).find(
    c => c.ticker.toUpperCase() === ticker.toUpperCase()
  );
  if (!entry) throw new Error(`Ticker "${ticker}" not found in SEC EDGAR`);
  return { cik: String(entry.cik_str).padStart(10, '0'), name: entry.title };
}

async function getCompanyFacts(cik) {
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  const resp = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!resp.ok) throw new Error(`SEC EDGAR companyfacts fetch failed (${resp.status})`);
  return resp.json();
}

function extractQuarterlyValues(gaap, conceptNames) {
  for (const name of conceptNames) {
    const concept = gaap[name];
    if (!concept) continue;
    const units = concept.units || {};
    const unitKey = Object.keys(units)[0];
    if (!unitKey) continue;
    const entries = units[unitKey];

    // Keep entries that represent a single quarter:
    // fp is Q1-Q4, OR the date range is 60-120 days
    const quarterly = entries.filter(e => {
      if (['Q1', 'Q2', 'Q3', 'Q4'].includes(e.fp)) return true;
      if (e.start && e.end) {
        const days = (new Date(e.end) - new Date(e.start)) / 86400000;
        return days >= 60 && days <= 120;
      }
      return false;
    });

    if (quarterly.length === 0) continue;

    // Deduplicate by period end date — keep the most-recently-filed value
    const periodMap = new Map();
    for (const e of quarterly) {
      const existing = periodMap.get(e.end);
      if (!existing || e.filed > existing.filed) periodMap.set(e.end, e);
    }

    return [...periodMap.values()]
      .sort((a, b) => a.end.localeCompare(b.end))
      .slice(-12)
      .map(e => ({ end: e.end, fp: e.fp, fy: e.fy, val: e.val, unit: unitKey }));
  }
  return [];
}

function buildQuarterLabel(endDate) {
  const d = new Date(endDate);
  const m = d.getUTCMonth() + 1;
  const y = d.getUTCFullYear();
  if (m <= 3) return `Q1 ${y}`;
  if (m <= 6) return `Q2 ${y}`;
  if (m <= 9) return `Q3 ${y}`;
  return `Q4 ${y}`;
}

function alignMetrics(rawMetrics) {
  // Use whichever metric has the most entries to define the canonical quarter set
  let canonicalDates = [];
  let maxLen = 0;
  for (const series of Object.values(rawMetrics)) {
    if (series.length > maxLen) {
      maxLen = series.length;
      canonicalDates = series.map(s => s.end);
    }
  }

  const quarters = canonicalDates.map(buildQuarterLabel);

  const aligned = {};
  for (const [key, series] of Object.entries(rawMetrics)) {
    const dateToVal = new Map(series.map(s => [s.end, s.val]));
    aligned[key] = canonicalDates.map(d => {
      const v = dateToVal.get(d);
      return v !== undefined ? v : null;
    });
  }

  return { quarters, metrics: aligned };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const { ticker } = event.queryStringParameters || {};
  if (!ticker) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'ticker param required' }) };
  }

  try {
    const { cik, name } = await getCIK(ticker);
    const factsData = await getCompanyFacts(cik);
    const gaap = (factsData.facts || {})['us-gaap'] || {};

    const rawMetrics = {};
    for (const [key, concepts] of Object.entries(CONCEPT_MAP)) {
      rawMetrics[key] = extractQuarterlyValues(gaap, concepts);
    }

    const { quarters, metrics } = alignMetrics(rawMetrics);

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ ticker: ticker.toUpperCase(), cik, company: name, quarters, metrics }),
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};

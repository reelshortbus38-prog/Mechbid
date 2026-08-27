// ── TERMS OF SERVICE AND PRIVACY POLICY ──────────────────────────────────────
// Real text, not a placeholder shell. What was here before was section headings
// with a sentence under each and a comment saying it must be replaced before
// selling — which left the one part nobody wants to write still unwritten.
//
// WHAT IS ACTUALLY MISSING, AND IT IS SHORT. Four facts nobody but the operator
// knows: the legal entity name, the state whose law governs, a contact email,
// and a mailing address. They are marked and the app reports which are still
// unfilled rather than shipping a policy that says [Your Company].
//
// TWO PLACES WHERE THE GENERIC VERSION IS NOT ENOUGH, and both depend on who
// signs up rather than on how the app is written:
//
//   EU or UK users     GDPR adds required disclosures — legal basis for each
//                      purpose, a representative in-region, transfer mechanism,
//                      and a shorter breach-notification clock. The clauses
//                      below cover the substance; the formal requirements are
//                      jurisdictional and are not attempted here.
//   California residents  CCPA/CPRA attaches above certain revenue and data
//                      thresholds and requires specific notices, including the
//                      right to opt out of "sale" or "sharing". This app sells
//                      nothing, which is stated, but the notice requirements
//                      are still formal.
//
// Everything else — subscription and refund terms, acceptable use, the
// estimating disclaimer, the liability cap, sub-processor disclosure, retention,
// deletion — is written out below and is the ordinary shape of a small SaaS
// agreement.
//
// THE CLAUSE THAT MATTERS MOST FOR THIS APP is the liability cap read together
// with the estimating disclaimer. The product's whole job is producing numbers
// somebody bids work on. If a bid goes wrong, that pair is what stands between
// the operator and the loss.
//
// Pure — no React.

// The operator of THIS service. Unlike the price book or the crew, these are
// not per-user settings: every contractor using Coldgauge is a customer of
// Coldgauge LLC, so the entity and its governing law are the same on every
// install and belong in code.
//
// The mailing address is deliberately still empty. Whatever goes there is
// published on a public web page, which is a different exposure from a state
// filing, and it is the operator's decision rather than a default. A profile
// value always overrides any of these, so a self-hosted or white-labelled
// install can still set its own.
export const LEGAL_DEFAULTS = {
  company: 'Coldgauge LLC',
  state: 'Virginia',
  contact: 'support@coldgauge.com',
  address: '',
};

export const LEGAL_PLACEHOLDERS = {
  company: '[Legal entity name, e.g. Acme Refrigeration LLC]',
  state: '[State]',
  contact: '[contact email]',
  address: '[mailing address]',
};

export const LEGAL_FIELDS = [
  { k: 'company', label: 'Legal entity name', ph: 'Acme Refrigeration LLC', why: 'Named as the operator in both documents.' },
  { k: 'state', label: 'Governing law (state)', ph: 'Virginia', why: 'Whose law applies and where disputes are heard.' },
  { k: 'contact', label: 'Contact email', ph: 'support@yourcompany.com', why: 'Required for privacy requests, and by Stripe.' },
  { k: 'address', label: 'Mailing address', ph: '123 Main St, City, ST 00000', why: 'Required by Stripe and by most app stores.' },
];

const fill = (profile, k) => {
  const v = String(profile?.[`legal_${k}`] || '').trim();
  return v || LEGAL_DEFAULTS[k] || LEGAL_PLACEHOLDERS[k];
};

// Which of the four are still unfilled. A policy reading "[Legal entity name]"
// is worse than no policy: it says nobody read it.
export function legalGaps(profile = {}) {
  return LEGAL_FIELDS
    .filter(f => !String(profile?.[`legal_${f.k}`] || '').trim() && !LEGAL_DEFAULTS[f.k])
    .map(f => f.k);
}

export function legalReady(profile = {}) {
  return legalGaps(profile).length === 0;
}

export const LAST_UPDATED = '2026-08-21';

export function termsSections(profile = {}) {
  const CO = fill(profile, 'company');
  const ST = fill(profile, 'state');
  const EM = fill(profile, 'contact');
  return [
    ['Agreement to these Terms',
      `These Terms of Service govern your use of Coldgauge (the "Service"), operated by ${CO} ("we", "us"). By `
      + 'creating an account or using the Service you agree to them. If you are agreeing on behalf of a company, '
      + 'you represent that you have authority to bind that company. If you do not agree, do not use the Service.'],

    ['What the Service is — and what it is not',
      'Coldgauge is an estimating aid for mechanical contractors. It assists with takeoff, pricing and proposal '
      + 'preparation, and it produces ESTIMATES — including quantities, sizes, scope and pricing derived in part '
      + 'from automated extraction of documents you upload, and in part from default values built into the '
      + 'Service. It is a tool for a qualified estimator, not a replacement for one, and it does not provide '
      + 'engineering, design, or professional advice of any kind. Nothing it outputs is a certified takeoff, a '
      + 'sealed design, or a guarantee of quantity or cost.'],

    ['Your responsibility for what you submit',
      'You are solely responsible for reviewing and verifying every figure before you rely on it — quantities, '
      + 'pipe and duct sizes, equipment selections, labor hours, scope, and all pricing — against the final '
      + 'construction documents, the applicable codes, and actual field conditions. Bids you submit are yours. '
      + 'You are responsible for their accuracy, for the contracts you enter, and for the work you perform.'],

    ['Accounts',
      'You must provide accurate account information and keep your credentials secure. You are responsible for '
      + 'activity under your account. Tell us promptly at ' + EM + ' if you believe your account has been used '
      + 'without your authorisation. You must be at least 18 and able to form a binding contract.'],

    ['Your data and your documents',
      'You keep all ownership of the documents you upload and the bids you create. You grant us only the '
      + 'licence needed to operate the Service for you: to store, process, transmit and display that content so '
      + 'the Service can function. We do not use your bid documents or pricing to train AI models, and we do '
      + 'not sell your data. You warrant that you have the right to upload what you upload — drawings and '
      + 'specifications frequently belong to an owner, architect or engineer and are often shared under '
      + 'confidentiality obligations, and honouring those is your responsibility.'],

    ['Processing by third parties',
      'To extract takeoff data, the contents of documents you upload are transmitted to third-party AI '
      + 'providers for processing, and other providers host the Service, store your data and process payments. '
      + 'They are listed in the Privacy Policy. Do not upload material you are not permitted to disclose to a '
      + 'third-party processor.'],

    ['Subscriptions, billing and cancellation',
      'Paid plans are billed in advance through Stripe on a recurring basis and RENEW AUTOMATICALLY until '
      + 'cancelled. You may cancel at any time from your account or by contacting ' + EM + '; cancellation takes '
      + 'effect at the end of the current billing period and you keep access until then. Fees already paid are '
      + 'non-refundable except where required by law or where we choose to make an exception. We may change '
      + 'pricing with at least 30 days’ notice before it applies to your next renewal. You are responsible for '
      + 'applicable taxes.'],

    ['Acceptable use',
      'Do not: upload content you lack the right to share; attempt to access another account or our systems '
      + 'without authorisation; probe, scrape, overload or reverse-engineer the Service; resell or provide the '
      + 'Service to third parties as a bureau without our agreement; or use it for anything unlawful.'],

    ['Our intellectual property',
      'The Service — its software, interface, default pricing tables, labor units and other built-in data — '
      + `remains the property of ${CO}. These Terms grant you a limited, non-exclusive, non-transferable right `
      + 'to use it while your account is active. You may freely use the bids and proposals you produce.'],

    ['Availability',
      'We aim to keep the Service available but do not guarantee uninterrupted access. We may modify, suspend '
      + 'or discontinue features. Bid deadlines are unforgiving: keep your own copies of anything you cannot '
      + 'afford to lose, and do not rely on the Service being reachable at a critical moment.'],

    ['Disclaimer of warranties',
      'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, '
      + 'INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. We do not warrant '
      + 'that extracted data, quantities, prices, labor hours or any other output are accurate, complete, or '
      + 'suitable for any bid or contract.'],

    ['Limitation of liability',
      `TO THE MAXIMUM EXTENT PERMITTED BY LAW, ${CO} WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, `
      + 'CONSEQUENTIAL OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, LOST BIDS, UNDERBID OR OVERBID WORK, COST '
      + 'OVERRUNS, LIQUIDATED DAMAGES, OR LOSS OF DATA OR GOODWILL, ARISING FROM OR RELATING TO THE SERVICE — '
      + 'WHETHER OR NOT WE WERE ADVISED SUCH DAMAGES WERE POSSIBLE. OUR TOTAL LIABILITY FOR ALL CLAIMS IN ANY '
      + 'TWELVE-MONTH PERIOD IS LIMITED TO THE AMOUNT YOU PAID US FOR THE SERVICE IN THAT PERIOD. Some '
      + 'jurisdictions do not allow certain exclusions, so parts of this may not apply to you.'],

    ['Indemnity',
      `You agree to indemnify and hold harmless ${CO} from claims arising out of your use of the Service, the `
      + 'documents you upload, the bids you submit, the contracts you enter, and your breach of these Terms.'],

    ['Termination',
      'You may stop using the Service and close your account at any time. We may suspend or terminate an '
      + 'account that breaches these Terms, or that we are required to suspend by law. On termination your right '
      + 'to use the Service ends; export your data first. The disclaimer, liability, indemnity and governing-law '
      + 'sections survive termination.'],

    ['Changes to these Terms',
      'We may update these Terms. Material changes will be posted here with a revised date and, for active '
      + 'subscribers, notified by email before taking effect. Continuing to use the Service after that means you '
      + 'accept the change.'],

    ['Governing law and disputes',
      `These Terms are governed by the laws of the State of ${ST}, without regard to conflict-of-law rules. The `
      + `state and federal courts located in ${ST} have exclusive jurisdiction, and both parties consent to that `
      + 'venue. Before filing anything, contact us at ' + EM + ' — most disputes are settled faster that way.'],

    ['Entire agreement',
      'These Terms and the Privacy Policy are the whole agreement between us about the Service. If any provision '
      + 'is unenforceable, the rest stays in force. Our not enforcing a provision is not a waiver of it.'],

    ['Contact', `Questions about these Terms: ${EM}.`],
  ];
}

export function privacySections(profile = {}) {
  const CO = fill(profile, 'company');
  const EM = fill(profile, 'contact');
  const AD = fill(profile, 'address');
  return [
    ['Who we are',
      `Coldgauge is operated by ${CO}, ${AD}. This policy explains what we collect, why, and what you can do about `
      + `it. Questions or requests: ${EM}.`],

    ['What we collect',
      'ACCOUNT DETAILS you give us — name, email, company name, and your login credentials. '
      + 'CONTENT YOU UPLOAD — drawings, specifications, schedules, bid letters and any other documents, plus the '
      + 'job data you create from them: takeoffs, pricing, labor, proposals. '
      + 'PAYMENT DETAILS are handled by Stripe; we receive a subscription status and the last four digits of a '
      + 'card, never the full number. '
      + 'BASIC USAGE DATA needed to operate and secure the Service, such as log and error information.'],

    ['Where your job data actually lives',
      'Jobs you create are stored in your browser’s local storage on the device you are using, and are synced '
      + 'to our database when you are signed in. Local storage means clearing site data, using a private window, '
      + 'or switching device or browser can leave a job unavailable. Use the export function for anything you '
      + 'need to keep.'],

    ['Documents are sent to AI providers for processing',
      'This is the disclosure that matters most. To read a drawing and produce a takeoff, the contents of the '
      + 'documents you upload are transmitted to third-party AI providers — Anthropic, and OpenAI via OpenRouter '
      + '— which process them and return extraction results. Do not upload material you are not permitted to '
      + 'disclose to a third-party processor. Construction documents are frequently confidential to an owner, '
      + 'architect or engineer.'],

    ['Service providers we use',
      'AI processing: Anthropic; OpenAI via OpenRouter. Hosting: Vercel. Database and authentication: Supabase. '
      + 'Payments: Stripe. Each processes data only to provide its part of the Service, under its own terms. We '
      + 'will update this list when it changes.'],

    ['How we use your data',
      'To operate the Service and produce your estimates; to keep your saved jobs and sync them across your '
      + 'devices; to process subscriptions and prevent fraud; to provide support you ask for; to diagnose faults '
      + 'and improve reliability; and to comply with law.'],

    ['What we do not do',
      'We do not sell or rent your personal information. We do not share your bid documents or pricing with '
      + 'other users. We do not use your uploaded documents or job data to train AI models. We do not use your '
      + 'data to bid against you.'],

    ['Retention and deletion',
      'We keep your account data while your account is active. Delete a job in the app and it is removed from '
      + 'your account. Ask us at ' + EM + ' and we will delete your account and its data, ordinarily within 30 '
      + 'days, except where we must keep records to meet a legal or tax obligation. Backups roll off on their own '
      + 'schedule. Copies held by AI providers are governed by their retention terms.'],

    ['Your rights',
      'You can access, correct, export or delete your data — most of it directly in the app, and the rest by '
      + `writing to ${EM}. Depending on where you live you may have further rights, including to object to or `
      + 'restrict processing, to withdraw consent, and to complain to a data-protection authority. We will not '
      + 'treat you differently for exercising any of them.'],

    ['Security',
      'Access requires authentication, data is encrypted in transit, and access to production systems is '
      + 'limited. No service can promise perfect security. If a breach affects your personal data, we will '
      + 'notify affected users and any regulator we are required to notify, without undue delay.'],

    ['Cookies and local storage',
      'We use cookies and browser storage to keep you signed in and to hold your job data on the device. There '
      + 'is no third-party advertising or cross-site tracking. Blocking them will stop the Service working.'],

    ['International transfers',
      'Our providers may process data in the United States and elsewhere. Where data moves out of your region we '
      + 'rely on the transfer terms in our agreements with those providers.'],

    ['Children',
      'The Service is for business use and is not directed to anyone under 18. We do not knowingly collect data '
      + `from children. If you believe a child has given us data, write to ${EM} and we will delete it.`],

    ['Changes to this policy',
      'We will post changes here and update the date below. Material changes affecting how we use your data will '
      + 'be notified to active subscribers by email.'],

    ['Contact', `Privacy questions and requests: ${EM}.`],
  ];
}

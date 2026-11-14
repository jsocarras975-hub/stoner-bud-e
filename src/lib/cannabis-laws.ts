// Stoner Bud-E — cannabis law snapshot by place.
//
// A plain-English lookup for the "Cannabis laws" tool: what is the law where
// you are? This is a snapshot, not legal advice — laws change all the time,
// and the short note is the lay of the land, not the full rulebook. The tool
// shows the "last updated" date and tells people to double-check with an
// official source before they act on it.
//
// Status meanings:
//   recreational   — adults can legally buy and use it.
//   medical        — legal with a medical card / prescription only (some places
//                    only allow low-THC or CBD products).
//   decriminalized — small personal amounts will not get you arrested, but
//                    there is no legal shop to buy it from.
//   illegal        — fully prohibited; possession can mean arrest and charges.

export type LawStatus = 'recreational' | 'medical' | 'decriminalized' | 'illegal';

export interface LawEntry {
  name: string;
  kind: 'US state' | 'Country';
  status: LawStatus;
  note: string;
}

/** When this snapshot was put together. Shown in the tool so people know how fresh it is. */
export const LAWS_UPDATED = 'November 2026';

export const STATUS_LABEL: Record<LawStatus, string> = {
  recreational: 'Recreational legal',
  medical: 'Medical only',
  decriminalized: 'Decriminalized',
  illegal: 'Illegal',
};

export const STATUS_EMOJI: Record<LawStatus, string> = {
  recreational: '🟢',
  medical: '🟡',
  decriminalized: '🟠',
  illegal: '🔴',
};

export const CANNABIS_LAWS: LawEntry[] = [
  // ---- United States (50 states + DC) ----
  { name: 'Alabama', kind: 'US state', status: 'medical', note: 'Medical only, and only a limited program. No recreational sales.' },
  { name: 'Alaska', kind: 'US state', status: 'recreational', note: 'Adults 21+ can buy and use. Legal since 2014.' },
  { name: 'Arizona', kind: 'US state', status: 'recreational', note: 'Adults 21+ can buy and use. Legal since 2020.' },
  { name: 'Arkansas', kind: 'US state', status: 'medical', note: 'Medical only, with a card. No recreational sales.' },
  { name: 'California', kind: 'US state', status: 'recreational', note: 'Adults 21+ can buy and use. The biggest legal market in the US.' },
  { name: 'Colorado', kind: 'US state', status: 'recreational', note: 'Adults 21+ can buy and use. First state to legalize, 2012.' },
  { name: 'Connecticut', kind: 'US state', status: 'recreational', note: 'Adults 21+ can buy and use. Legal since 2021.' },
  { name: 'Delaware', kind: 'US state', status: 'recreational', note: 'Adults 21+ can possess and use. Legal since 2023.' },
  { name: 'Florida', kind: 'US state', status: 'medical', note: 'Medical only, with a card. Recreational is still illegal.' },
  { name: 'Georgia', kind: 'US state', status: 'medical', note: 'Very limited — low-THC oil only, for a short list of conditions.' },
  { name: 'Hawaii', kind: 'US state', status: 'medical', note: 'Medical only, with a card. Small amounts decriminalized.' },
  { name: 'Idaho', kind: 'US state', status: 'illegal', note: 'Fully illegal — no medical program and no decriminalization.' },
  { name: 'Illinois', kind: 'US state', status: 'recreational', note: 'Adults 21+ can buy and use. Legal since 2020.' },
  { name: 'Indiana', kind: 'US state', status: 'illegal', note: 'Fully illegal. CBD oil is allowed; anything with THC is not.' },
  { name: 'Iowa', kind: 'US state', status: 'medical', note: 'Very limited — low-THC products only, for a short list of conditions.' },
  { name: 'Kansas', kind: 'US state', status: 'illegal', note: 'Fully illegal — no medical program and no decriminalization.' },
  { name: 'Kentucky', kind: 'US state', status: 'medical', note: 'Medical only, with a card. Program started in 2025.' },
  { name: 'Louisiana', kind: 'US state', status: 'medical', note: 'Medical only, with a recommendation. Small amounts decriminalized.' },
  { name: 'Maine', kind: 'US state', status: 'recreational', note: 'Adults 21+ can buy and use. Legal since 2016.' },
  { name: 'Maryland', kind: 'US state', status: 'recreational', note: 'Adults 21+ can buy and use. Legal since 2023.' },
  { name: 'Massachusetts', kind: 'US state', status: 'recreational', note: 'Adults 21+ can buy and use. Legal since 2016.' },
  { name: 'Michigan', kind: 'US state', status: 'recreational', note: 'Adults 21+ can buy and use. Legal since 2018.' },
  { name: 'Minnesota', kind: 'US state', status: 'recreational', note: 'Adults 21+ can possess and use. Legal since 2023.' },
  { name: 'Mississippi', kind: 'US state', status: 'medical', note: 'Medical only, with a card. No recreational sales.' },
  { name: 'Missouri', kind: 'US state', status: 'recreational', note: 'Adults 21+ can buy and use. Legal since 2022.' },
  { name: 'Montana', kind: 'US state', status: 'recreational', note: 'Adults 21+ can buy and use. Legal since 2020.' },
  { name: 'Nebraska', kind: 'US state', status: 'medical', note: 'Medical approved by voters in 2024. Small amounts decriminalized.' },
  { name: 'Nevada', kind: 'US state', status: 'recreational', note: 'Adults 21+ can buy and use. Legal since 2016.' },
  { name: 'New Hampshire', kind: 'US state', status: 'medical', note: 'Medical only, with a card. Small amounts decriminalized.' },
  { name: 'New Jersey', kind: 'US state', status: 'recreational', note: 'Adults 21+ can buy and use. Legal since 2020.' },
  { name: 'New Mexico', kind: 'US state', status: 'recreational', note: 'Adults 21+ can buy and use. Legal since 2021.' },
  { name: 'New York', kind: 'US state', status: 'recreational', note: 'Adults 21+ can buy and use. Legal since 2021.' },
  { name: 'North Carolina', kind: 'US state', status: 'medical', note: 'Very limited — CBD oil only, for epilepsy. Everything else is illegal.' },
  { name: 'North Dakota', kind: 'US state', status: 'medical', note: 'Medical only, with a card. No recreational sales.' },
  { name: 'Ohio', kind: 'US state', status: 'recreational', note: 'Adults 21+ can buy and use. Legal since 2023.' },
  { name: 'Oklahoma', kind: 'US state', status: 'medical', note: 'Medical only, with a card — one of the easiest medical programs to join.' },
  { name: 'Oregon', kind: 'US state', status: 'recreational', note: 'Adults 21+ can buy and use. Legal since 2014.' },
  { name: 'Pennsylvania', kind: 'US state', status: 'medical', note: 'Medical only, with a card. No recreational sales.' },
  { name: 'Rhode Island', kind: 'US state', status: 'recreational', note: 'Adults 21+ can buy and use. Legal since 2022.' },
  { name: 'South Carolina', kind: 'US state', status: 'illegal', note: 'Fully illegal — no medical program and no decriminalization.' },
  { name: 'South Dakota', kind: 'US state', status: 'medical', note: 'Medical only, with a card. No recreational sales.' },
  { name: 'Tennessee', kind: 'US state', status: 'illegal', note: 'Fully illegal. CBD oil is allowed; anything with THC is not.' },
  { name: 'Texas', kind: 'US state', status: 'medical', note: 'Very limited — low-THC oil only, for a short list of conditions. Recreational is illegal.' },
  { name: 'Utah', kind: 'US state', status: 'medical', note: 'Medical only, with a card. No recreational sales.' },
  { name: 'Vermont', kind: 'US state', status: 'recreational', note: 'Adults 21+ can buy and use. Legal since 2018.' },
  { name: 'Virginia', kind: 'US state', status: 'recreational', note: 'Adults 21+ can possess and use. Shops are still not open yet.' },
  { name: 'Washington', kind: 'US state', status: 'recreational', note: 'Adults 21+ can buy and use. First state to legalize, 2012.' },
  { name: 'Washington DC', kind: 'US state', status: 'recreational', note: 'Adults 21+ can possess and use, and gift it. No legal shops to buy from.' },
  { name: 'West Virginia', kind: 'US state', status: 'medical', note: 'Medical only, with a card. No recreational sales.' },
  { name: 'Wisconsin', kind: 'US state', status: 'medical', note: 'Very limited — CBD oil only, for a short list of conditions.' },
  { name: 'Wyoming', kind: 'US state', status: 'illegal', note: 'Fully illegal — no medical program and no decriminalization.' },
  // ---- Countries ----
  { name: 'Australia', kind: 'Country', status: 'medical', note: 'Medical only, with a prescription. Personal use is decriminalized in the ACT.' },
  { name: 'Brazil', kind: 'Country', status: 'decriminalized', note: 'Small personal amounts decriminalized since 2024. Medical is legal with a prescription.' },
  { name: 'Canada', kind: 'Country', status: 'recreational', note: 'Fully legal for adults across the whole country since 2018.' },
  { name: 'Colombia', kind: 'Country', status: 'decriminalized', note: 'Small personal amounts decriminalized. Medical is legal with a prescription.' },
  { name: 'Czech Republic', kind: 'Country', status: 'decriminalized', note: 'Small personal amounts decriminalized. Medical is legal with a prescription.' },
  { name: 'France', kind: 'Country', status: 'illegal', note: 'Illegal — only a small medical pilot program. Fines for possession.' },
  { name: 'Germany', kind: 'Country', status: 'recreational', note: 'Adults can possess and grow it since 2024. No retail shops yet — clubs only.' },
  { name: 'India', kind: 'Country', status: 'illegal', note: 'Illegal nationwide, though bhang is tolerated in some states and medical use is limited.' },
  { name: 'Israel', kind: 'Country', status: 'decriminalized', note: 'Small personal amounts decriminalized. Medical is legal with a prescription.' },
  { name: 'Italy', kind: 'Country', status: 'decriminalized', note: 'Small personal amounts decriminalized. Medical is legal with a prescription.' },
  { name: 'Jamaica', kind: 'Country', status: 'decriminalized', note: 'Small personal amounts decriminalized. Medical and Rastafari use are protected.' },
  { name: 'Japan', kind: 'Country', status: 'illegal', note: 'Illegal and strictly enforced — even small amounts can mean serious charges.' },
  { name: 'Mexico', kind: 'Country', status: 'decriminalized', note: 'Small personal amounts decriminalized. A full legal framework is still pending.' },
  { name: 'Netherlands', kind: 'Country', status: 'decriminalized', note: 'Tolerated in licensed coffee shops. Technically still illegal, but not enforced for small amounts.' },
  { name: 'Portugal', kind: 'Country', status: 'decriminalized', note: 'Small personal amounts of all drugs decriminalized since 2001. Medical is legal.' },
  { name: 'South Africa', kind: 'Country', status: 'decriminalized', note: 'Private personal use is legal. Buying and selling it is still illegal.' },
  { name: 'South Korea', kind: 'Country', status: 'illegal', note: 'Illegal, with very limited medical exceptions. Strictly enforced.' },
  { name: 'Spain', kind: 'Country', status: 'decriminalized', note: 'Private personal use tolerated, and cannabis clubs operate openly. Public use can still be fined.' },
  { name: 'Switzerland', kind: 'Country', status: 'decriminalized', note: 'Small personal amounts decriminalized. Medical is legal with a prescription.' },
  { name: 'Thailand', kind: 'Country', status: 'medical', note: 'Medical only, with strict rules. Recreational was decriminalized in 2022, then tightened back up.' },
  { name: 'United Kingdom', kind: 'Country', status: 'medical', note: 'Medical only, with a prescription — and it is hard to get one. Recreational is illegal.' },
  { name: 'Uruguay', kind: 'Country', status: 'recreational', note: 'Fully legal for adults since 2013 — the first country in the world to legalize it.' },
];

/** Case-insensitive substring match on the place name. Empty query returns everything. */
export function searchLaws(query: string): LawEntry[] {
  const q = query.trim().toLowerCase();
  if (q === '') return CANNABIS_LAWS;
  return CANNABIS_LAWS.filter((e) => e.name.toLowerCase().includes(q));
}

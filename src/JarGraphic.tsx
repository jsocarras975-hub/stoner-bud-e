// A visible jar for a stash entry — a real jar you can see, not just a
// text row. The glass jar shows the strain inside it (on the label) and how
// full it is (the fill rises to amount / startedAt). The fill color depends
// on what is inside: green for flower, amber for edibles, purple for vape,
// gold for dabs, blue for drinks.

import { JAR_FILL_COLORS, jarFillPct, type StashItem } from './stash';

export default function JarGraphic({ item }: { item: StashItem }) {
  const pct = jarFillPct(item);
  const color = JAR_FILL_COLORS[item.form] ?? JAR_FILL_COLORS.other;
  const empty = item.amount <= 0;
  return (
    <div className="jar-graphic" role="img" aria-label={`${item.name}, ${Math.round(pct)}% full, ${item.amount}${item.unit} left`}>
      <div className="jar-lid" aria-hidden />
      <div className="jar-body" aria-hidden>
        <div
          className="jar-fill"
          style={{
            height: `${pct}%`,
            background: `linear-gradient(180deg, ${color} 0%, ${color}cc 100%)`,
          }}
        >
          {/* Little buds in the fill, so it reads as flower, not water. */}
          <span className="jar-bud" style={{ left: '18%', bottom: '12%' }} />
          <span className="jar-bud" style={{ left: '58%', bottom: '30%' }} />
          <span className="jar-bud" style={{ left: '32%', bottom: '52%' }} />
          <span className="jar-bud" style={{ left: '70%', bottom: '62%' }} />
        </div>
        <div className="jar-label">
          <span className="jar-label-name">{item.name}</span>
          <span className="jar-label-amount">
            {empty ? 'Empty' : `${item.amount}${item.unit} · ${Math.round(pct)}%`}
          </span>
        </div>
      </div>
    </div>
  );
}

// The live sentence: the neighbourhood's week in a few short, plain sentences built from real
// counts. The numbers are painted like road markings as you scroll; everything else is plain text.
import type { WeekStats } from './queries';
import { placePhrase } from './queries';

export type Token = { kind: 'word'; text: string; strong?: boolean; href?: string };

const words = (s: string, strong = false, href?: string): Token[] =>
  s.split(' ').filter(Boolean).map((text) => ({ kind: 'word' as const, text, strong, href }));

export function buildSentence(s: WeekStats, lang: Lang, links: { forum: string; place?: string }): Token[] {
  const out: Token[] = [];
  const sq = lang === 'sq';

  if (s.topics === 0 && s.people === 0) {
    out.push(...words(sq ? 'Këtë javë lagjja ishte e qetë:' : 'This week the neighbourhood was quiet:'));
    out.push(...words(sq ? 'asnjë temë e re.' : 'no new topics.', true));
    out.push(...words(sq ? 'Shkruaj ti të parën.' : 'Write the first one.', false, links.forum));
    return out;
  }

  // "Këtë javë morën pjesë 35 fqinjë."
  if (s.people > 0) {
    out.push(...words(sq ? (s.people === 1 ? 'Këtë javë mori pjesë' : 'Këtë javë morën pjesë') : 'This week'));
    out.push(...words(sq ? `${s.people} ${s.people === 1 ? 'fqinj' : 'fqinjë'}.` : `${s.people} ${s.people === 1 ? 'neighbour' : 'neighbours'}`, true));
    if (!sq) out.push(...words('took part.'));
  }

  // "U hapën 4 tema të reja, më së shumti në Bllok."
  if (s.topics > 0) {
    const n = s.topics;
    if (sq) {
      out.push(...words(n === 1 ? 'U hap' : 'U hapën'));
      out.push(...words(n === 1 ? '1 temë e re' : `${n} tema të reja`, true, links.forum));
    } else {
      out.push(...words(n === 1 ? '1 new topic' : `${n} new topics`, true, links.forum));
      out.push(...words(n === 1 ? 'was opened' : 'were opened'));
    }
    if (s.topPlace) {
      out.push(...words(sq ? ', më së shumti' : ', most of them'));
      out.push(...words(placePhrase(s.topPlace, lang) + '.', true, links.place));
    } else {
      out.push(...words('.'));
    }
  }

  // "Ekipi përgjigjet zakonisht brenda 6 orësh."
  if (s.medianReplyHours) {
    const h = s.medianReplyHours;
    out.push(...words(sq ? 'Ekipi përgjigjet zakonisht brenda' : 'The team usually replies within'));
    out.push(...words(sq ? `${h} ${h === 1 ? 'ore' : 'orësh'}.` : `${h} ${h === 1 ? 'hour' : 'hours'}.`, true));
  }

  // "Propozimet morën 27 mbështetje."
  if (s.supports > 0) {
    out.push(...words(sq ? 'Propozimet morën' : 'Proposals received'));
    out.push(...words(sq ? `${s.supports} mbështetje.` : `${s.supports} ${s.supports === 1 ? 'vote' : 'votes'} of support.`, true));
  }

  // glue lone punctuation (",", ".") onto the word before it
  return out.reduce<Token[]>((acc, tk) => {
    if (/^[,.]/.test(tk.text) && acc.length) {
      const prev = acc[acc.length - 1];
      prev.text += tk.text[0];
      const rest = tk.text.slice(1);
      if (rest) acc.push({ ...tk, text: rest });
    } else acc.push(tk);
    return acc;
  }, []);
}

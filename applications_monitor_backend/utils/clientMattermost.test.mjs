// node utils/clientMattermost.test.mjs
//
// Pins the channel copy for each milestone mirror. The email is the record;
// this is the nudge, and it has to carry the number the client asks about
// ("how many so far", "is the plan done") or it is just noise in the channel.
import { buildMilestoneMattermostText } from './clientMattermost.js';

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`        got=${got}  want=${want}`);
};

{
  const text = buildMilestoneMattermostText({
    type: 'started', name: 'Asha Rao', planLabel: 'Executive', planCap: 1200, currentCount: 12, threshold: 10
  });
  t('started: heading', text.startsWith('#### Your resume is ready and applications are going out'), true);
  t('started: greets by name', text.includes('Hi Asha Rao'), true);
  t('started: names the plan cap', text.includes('Executive plan covers **1,200** roles'), true);
  t('started: dashboard link', text.includes('[Open your dashboard](https://portal.flashfirejobs.com)'), true);
}
{
  const text = buildMilestoneMattermostText({
    type: 'count_milestone', name: 'Asha', planLabel: 'Professional', planCap: 600, currentCount: 317, threshold: 300
  });
  t('count: heading carries the threshold', text.startsWith('#### 300 applications submitted'), true);
  t('count: progress so far', text.includes('(317 of 600 so far)'), true);
  t('count: bold threshold', text.includes('**300 applications**'), true);
}
{
  const text = buildMilestoneMattermostText({
    type: 'completed', name: 'Asha', planLabel: 'Prime', planCap: 300, currentCount: 300, threshold: 300
  });
  t('completed: heading', text.startsWith('#### All 300 applications done'), true);
  t('completed: wrap line', text.includes('that is a wrap on all **300 applications** under your Prime plan'), true);
}
{
  const text = buildMilestoneMattermostText({ type: 'mystery', subject: 'Something new' });
  t('unknown type: falls back to the email subject', text.startsWith('#### Something new'), true);
  t('unknown type: still says an email exists', text.includes('emailed you'), true);
}
{
  const text = buildMilestoneMattermostText({ type: 'started', name: '*Asha*_Rao', planLabel: 'Prime', planCap: 300 });
  t('name is markdown-escaped', text.includes('Hi \\*Asha\\*\\_Rao'), true);
  const noName = buildMilestoneMattermostText({ type: 'started', planLabel: 'Prime', planCap: 300 });
  t('missing name falls back to "there"', noName.includes('Hi there'), true);
  const custom = buildMilestoneMattermostText({ type: 'started', planCap: 300, dashboardUrl: 'https://x.example/' });
  t('custom dashboard url', custom.includes('(https://x.example/)'), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

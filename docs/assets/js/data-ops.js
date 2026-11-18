/* RealCognix OS — prototype operations data (fictitious) */
(function () {
  'use strict';
  var D = window.RC.data;

  D.team = [
    { name: 'Ananya R.', role: 'Sales manager', langs: 'Kannada, Tulu, English', territory: 'Mangaluru, Udupi', active: 48, sla: 97, calls: 34, visits: 18, bookings: 6, status: 'Available' },
    { name: 'Karthik S.', role: 'Senior sales executive', langs: 'Kannada, Tamil, English', territory: 'Bengaluru North', active: 61, sla: 94, calls: 41, visits: 22, bookings: 7, status: 'On a call' },
    { name: 'Fathima N.', role: 'Sales executive', langs: 'Malayalam, Kannada, Hindi', territory: 'Mysuru', active: 39, sla: 88, calls: 27, visits: 11, bookings: 3, status: 'Available' },
    { name: 'Rohan D.', role: 'Sales executive', langs: 'Telugu, Hindi, English', territory: 'Hyderabad', active: 44, sla: 91, calls: 30, visits: 14, bookings: 4, status: 'At site' },
    { name: 'Meera P.', role: 'Pre-sales', langs: 'Marathi, Hindi, English', territory: 'Pune', active: 22, sla: 99, calls: 52, visits: 6, bookings: 1, status: 'Available' },
    { name: 'Vikram K.', role: 'NRI desk', langs: 'English, Hindi, Kannada', territory: 'Gulf, US, UK', active: 31, sla: 93, calls: 19, visits: 8, bookings: 2, status: 'Off shift' }
  ];

  D.agents = [
    { key: 'onboard', name: 'Onboarding', icon: 'building', job: 'Reads brochures and price lists, builds project records and checks RERA numbers.', status: 'Idle', runs: 3, pending: 1, model: 'Gemini Flash · free tier' },
    { key: 'intel', name: 'Market Intel', icon: 'target', job: 'Compares nearby launches, price per sq ft and buyer demand before any spend.', status: 'Running', runs: 6, pending: 0, model: 'Llama 3.1 8B · Ollama' },
    { key: 'creative', name: 'Creative', icon: 'image', job: 'Drafts ad copy, captions and WhatsApp messages in five languages.', status: 'Awaiting approval', runs: 14, pending: 4, model: 'Gemini Flash · free tier' },
    { key: 'optimizer', name: 'Campaign Optimizer', icon: 'megaphone', job: 'Reads Meta and Google results daily and proposes budget shifts.', status: 'Awaiting approval', runs: 2, pending: 2, model: 'Llama 3.1 70B · Groq' },
    { key: 'qualifier', name: 'Lead Qualifier', icon: 'star', job: 'Scores every new lead on budget, timeline, location and intent.', status: 'Running', runs: 212, pending: 0, model: 'Llama 3.1 8B · Ollama' },
    { key: 'router', name: 'Router', icon: 'route', job: 'Assigns leads by project, language and load, and reassigns after 5 minutes.', status: 'Running', runs: 212, pending: 0, model: 'Rules · no LLM' },
    { key: 'followup', name: 'Follow-up', icon: 'chat', job: 'Writes the next WhatsApp or email in each cadence, inside approved templates.', status: 'Running', runs: 388, pending: 0, model: 'Llama 3.1 8B · Ollama' },
    { key: 'visit', name: 'Visit Concierge', icon: 'calendar', job: 'Books slots, sends reminders and directions, and collects feedback.', status: 'Running', runs: 57, pending: 0, model: 'Gemini Flash · free tier' },
    { key: 'report', name: 'Reporting', icon: 'chart', job: 'Writes each client’s weekly report with a plain-language summary.', status: 'Awaiting approval', runs: 4, pending: 1, model: 'Gemini Flash · free tier' },
    { key: 'compliance', name: 'Compliance Guard', icon: 'shieldCheck', job: 'Blocks unapproved claims, missing RERA numbers, DND and night-time sends.', status: 'Running', runs: 431, pending: 0, model: 'Rules + Llama 3.1 8B' }
  ];
  D.approvals = [
    { what: '4 ad creatives · Tidewater Diwali offer', agent: 'Creative', impact: 'Goes live to about 180,000 people', go: '#/campaigns' },
    { what: 'Shift ₹40,000 from MagicBricks to Meta lookalike', agent: 'Campaign Optimizer', impact: 'Est. +11 site visits per month', go: '#/campaigns' },
    { what: 'Pause YouTube walkthrough on Orchard Row', agent: 'Campaign Optimizer', impact: 'Saves ₹64,000 per month', go: '#/campaigns' },
    { what: 'Weekly report · Coastal Crest Developers', agent: 'Reporting', impact: 'Shared with client portal', go: '#/reports' },
    { what: 'Project import · Sahyog Greens price list', agent: 'Onboarding', impact: '180 units, 6 unit types', go: '#/projects' }
  ];
  D.runlog = [
    ['10:44:12', 'Lead Qualifier', 'Scored L-24180 Rahul Shetty: 86 (hot)', 'Llama 3.1 8B', '0.9 s'],
    ['10:44:13', 'Router', 'Assigned L-24180 to Ananya R. (Kannada, Tidewater)', 'Rules', '0.1 s'],
    ['10:43:58', 'Compliance Guard', 'Held WhatsApp to L-24171: outside 9 am to 9 pm window', 'Rules', '0.1 s'],
    ['10:41:02', 'Follow-up', 'Drafted Day 3 message for 14 leads (Nandi Skyline)', 'Llama 3.1 8B', '6.2 s'],
    ['10:38:40', 'Creative', 'Generated 4 variants · Tidewater Diwali offer', 'Gemini Flash', '8.4 s'],
    ['10:36:11', 'Compliance Guard', 'Blocked creative cr4: assured-return claim', 'Llama 3.1 8B', '1.3 s'],
    ['10:30:00', 'Visit Concierge', 'Sent 9 visit reminders for tomorrow', 'Templates', '2.0 s'],
    ['10:12:47', 'Market Intel', 'Compared 7 launches within 3 km of Orchard Row', 'Llama 3.1 8B', '22.6 s']
  ];

  D.cadences = [
    { id: 'cd1', name: 'New lead · speed to lead', trigger: 'Lead created (any source)', leads: 46, status: 'Active', reply: '64%',
      steps: [['whatsapp', 'WhatsApp · welcome_brochure', 'Instantly, if consent is recorded'], ['users', 'Assign by project and language', 'Within 30 seconds'], ['phone', 'Call task for owner', 'Due in 5 minutes'], ['timer', 'Not called in 5 min', 'Reassign to next available'], ['mail', 'Email · brochure and price list', 'After 15 minutes']] },
    { id: 'cd2', name: 'Follow-up · Day 0/1/3/7/14/30', trigger: 'Lead not yet visited', leads: 318, status: 'Active', reply: '38%',
      steps: [['whatsapp', 'Day 1 · followup_visit_invite', '10:30 am'], ['phone', 'Day 3 · call task', 'Owner'], ['whatsapp', 'Day 7 · followup_offer', '11 am'], ['mail', 'Day 14 · project update email', '9 am'], ['whatsapp', 'Day 30 · nurture_monthly', 'Monthly after']] },
    { id: 'cd3', name: 'Post-visit nurture', trigger: 'Visit marked done', leads: 61, status: 'Active', reply: '52%',
      steps: [['whatsapp', 'Thank you + cost sheet', 'Same evening'], ['phone', 'Manager call', 'Next day'], ['whatsapp', 'Unit hold offer, 48 h', 'Day 3']] },
    { id: 'cd4', name: 'Cold lead recycle', trigger: 'No reply in 45 days', leads: 1140, status: 'Paused', reply: '9%',
      steps: [['whatsapp', 'New launch / price update', 'Once'], ['star', 'Re-score on reply', 'Lead Qualifier']] },
    { id: 'cd5', name: 'NRI time-zone sequence', trigger: 'Country code not +91', leads: 37, status: 'Active', reply: '41%',
      steps: [['whatsapp', 'Welcome in their evening', '7 pm local time'], ['calendar', 'Video walkthrough offer', 'Weekdays'], ['mail', 'POA and NRI loan guide', 'Day 2']] }
  ];
  D.routingRules = [
    ['Project match', 'Each project has its own sales pool'],
    ['Language', 'Match the buyer’s language from the form or first message'],
    ['Round robin by load', 'Fewest open hot leads first'],
    ['5-minute rule', 'Uncalled hot lead moves to the next person, manager is told'],
    ['Quiet hours', 'No WhatsApp or calls from 9 pm to 9 am buyer time'],
    ['NRI', 'Non-Indian numbers go to the NRI desk']
  ];

  D.visits = [
    { day: 0, h: 10, lead: 'Rahul Shetty', project: 'Tidewater Residences', exec: 'Ananya R.', status: 'Confirmed', mode: 'Site' },
    { day: 0, h: 11, lead: 'Arvind Iyer', project: 'Nandi Skyline', exec: 'Karthik S.', status: 'Checked-in', mode: 'Site' },
    { day: 0, h: 13, lead: 'Sneha Nair', project: 'Orchard Row', exec: 'Karthik S.', status: 'Reminder sent', mode: 'Site' },
    { day: 0, h: 16, lead: 'Anjali Nair', project: 'Chamundi View', exec: 'Fathima N.', status: 'Confirmed', mode: 'Site' },
    { day: 1, h: 10, lead: 'Rakesh Kulkarni', project: 'Arc Meridian', exec: 'Rohan D.', status: 'Confirmed', mode: 'Site' },
    { day: 1, h: 15, lead: 'Lakshmi Gowda', project: 'Tidewater Residences', exec: 'Ananya R.', status: 'Reminder sent', mode: 'Site' },
    { day: 2, h: 19, lead: 'Prakash Kamath', project: 'Baywalk Villas', exec: 'Vikram K.', status: 'Confirmed', mode: 'Video' },
    { day: 3, h: 11, lead: 'Kavya Hegde', project: 'Nandi Skyline', exec: 'Karthik S.', status: 'Rescheduled', mode: 'Site' },
    { day: 4, h: 10, lead: 'Imran Khan', project: 'Arc Meridian', exec: 'Rohan D.', status: 'Confirmed', mode: 'Site' },
    { day: 5, h: 11, lead: 'Deepa Prabhu', project: 'Tidewater Residences', exec: 'Ananya R.', status: 'Confirmed', mode: 'Site' },
    { day: 5, h: 12, lead: 'Vinay Bhat', project: 'Chamundi View', exec: 'Fathima N.', status: 'Confirmed', mode: 'Site' },
    { day: 5, h: 15, lead: 'Pooja Acharya', project: 'Nandi Skyline', exec: 'Karthik S.', status: 'Confirmed', mode: 'Site' },
    { day: 6, h: 11, lead: 'Suresh Naik', project: 'Baywalk Villas', exec: 'Ananya R.', status: 'Confirmed', mode: 'Site' },
    { day: -1, h: 11, lead: 'Nikhil Menon', project: 'Nandi Skyline', exec: 'Karthik S.', status: 'No-show', mode: 'Site' }
  ];
  D.visitFeedback = [
    { lead: 'Mohammed Fernandes', project: 'Tidewater Residences', rating: 'Hot', note: 'Liked 3 BHK Sky Deck, wants 2% off and a covered car park. Spouse to visit Sunday.' },
    { lead: 'Shruti Joshi', project: 'Nandi Skyline', rating: 'Warm', note: 'Comparing with a Hebbal project. Concerned about traffic to Manyata.' },
    { lead: 'Harish Reddy', project: 'Arc Meridian', rating: 'Hot', note: 'Ready to pay token if 4 BHK on floor 18+ is held for 3 days.' }
  ];

  D.bookings = [
    { unit: 'B-1204', project: 'Nandi Skyline', client: 'nhb', buyer: 'Gautham Pai', value: 162, token: 5, status: 'Token received', loan: 'Sanctioned · SBI', docs: 80, date: '16 Nov 2026' },
    { unit: 'T-0907', project: 'Tidewater Residences', client: 'ccd', buyer: 'Swathi Hegde', value: 108, token: 2, status: 'Agreement signed', loan: 'In process · HDFC', docs: 100, date: '14 Nov 2026' },
    { unit: 'V-12', project: 'Baywalk Villas', client: 'ccd', buyer: 'Joseph D’Souza', value: 268, token: 10, status: 'Agreement signed', loan: 'Self-funded', docs: 100, date: '11 Nov 2026' },
    { unit: 'A-1802', project: 'Arc Meridian', client: 'dar', buyer: 'Nithya Reddy', value: 214, token: 5, status: 'Token received', loan: 'Applied · ICICI', docs: 60, date: '10 Nov 2026' },
    { unit: 'C-504', project: 'Chamundi View', client: 'sye', buyer: 'Manoj Gowda', value: 71, token: 1, status: 'Pending', loan: 'Applied · Canara', docs: 40, date: '09 Nov 2026' },
    { unit: 'O-302', project: 'Orchard Row', client: 'nhb', buyer: 'Bhavana Iyer', value: 151, token: 3, status: 'Registered', loan: 'Disbursed · Axis', docs: 100, date: '02 Nov 2026' }
  ];

  D.partners = [
    { name: 'Prime Nest Realtors', city: 'Bengaluru', rera: 'PRM/KA/RERA/1251/309/AG/220817/003114', leads: 64, visits: 21, bookings: 4, payout: 3.9, status: 'Active' },
    { name: 'Coastline Property Advisors', city: 'Mangaluru', rera: 'PRM/KA/RERA/1257/334/AG/230412/003560', leads: 38, visits: 15, bookings: 3, payout: 2.6, status: 'Active' },
    { name: 'Gulf Homes India (NRI)', city: 'Dubai', rera: 'PRM/KA/RERA/1251/309/AG/240101/004011', leads: 29, visits: 7, bookings: 2, payout: 4.1, status: 'Active' },
    { name: 'Heritage Realty Mysuru', city: 'Mysuru', rera: 'PRM/KA/RERA/1268/446/AG/230930/003802', leads: 17, visits: 4, bookings: 0, payout: 0, status: 'Active' },
    { name: 'Kokapet Home Finders', city: 'Hyderabad', rera: 'A02400004417', leads: 22, visits: 8, bookings: 1, payout: 2.1, status: 'Pending' }
  ];

  D.integrations = [
    { group: 'AI models (swappable)', items: [['Ollama', 'Local Llama 3.1 · free', true], ['Google Gemini', 'Flash · free tier', true], ['Groq', 'Llama 3.1 70B · free tier', true], ['Any OpenAI-compatible', 'Via LiteLLM gateway', false]] },
    { group: 'Messaging', items: [['WhatsApp Cloud API', 'Meta · 6 approved templates', true], ['Brevo', 'Email · 300 a day free', true], ['SMTP', 'Fallback email', false]] },
    { group: 'Ads', items: [['Meta Ads', 'Lead forms + reporting', true], ['Google Ads', 'Search, PMax, YouTube', true]] },
    { group: 'Property portals', items: [['99acres', 'Lead email parser', true], ['MagicBricks', 'Lead email parser', true], ['Housing.com', 'Lead email parser', true], ['NoBroker', 'Not connected', false]] },
    { group: 'Automation and analytics', items: [['n8n', 'Self-hosted workflows', true], ['PostHog', 'Microsite analytics', true], ['Metabase', 'Client dashboards', false]] }
  ];

  D.reports = {
    ccd: { spend: 3.4, leads: 412, cpl: 825, qual: 41, visits: 82, cpv: 4146, bookings: 9, roas: 46, weeks: [62, 71, 68, 84, 79, 96, 88, 104], visitsW: [11, 13, 12, 16, 15, 19, 17, 21],
      summary: 'Coastal Crest had its best week since launch: 104 leads and 21 site visits. Search for 3 BHK in Kadri Hills brought the most buyers who visited. Meta brought volume but more window-shoppers, so we moved ₹15,000 to lookalike audiences. Two Baywalk villa buyers from the Gulf are ready to visit in December.' },
    nhb: { spend: 5.1, leads: 508, cpl: 1004, qual: 34, visits: 93, cpv: 5484, bookings: 11, roas: 39, weeks: [80, 92, 88, 101, 97, 110, 118, 126], visitsW: [14, 15, 13, 18, 17, 20, 22, 24],
      summary: 'Nandi Skyline is selling steadily, with 11 bookings this month. PMax is still learning and costs more per visit, so we will judge it next week. The IT-corridor Meta campaign needs fresh creative because people have seen it almost four times.' },
    sye: { spend: 0.9, leads: 146, cpl: 616, qual: 22, visits: 18, cpv: 5000, bookings: 3, roas: 24, weeks: [30, 28, 34, 31, 36, 33, 29, 27], visitsW: [3, 4, 4, 3, 5, 4, 3, 3],
      summary: 'Chamundi View leads are cheap but fewer are serious buyers. We recommend narrowing ads to 15 km and adding a Kannada video tour. Visits held steady at three to five a week.' },
    dar: { spend: 1.7, leads: 218, cpl: 780, qual: 38, visits: 31, cpv: 5484, bookings: 4, roas: 51, weeks: [22, 30, 41, 44, 52, 58, 61, 66], visitsW: [2, 3, 5, 6, 7, 8, 8, 9],
      summary: 'Arc Meridian is ramping up well in Kokapet. 99acres brings better buyers than MagicBricks, so MagicBricks stays paused. Four bookings so far, all 4 BHK on high floors.' }
  };
  D.attribution = [['Meta Lead Ads', 41, 33, 38], ['Google Search', 22, 29, 33], ['99acres', 12, 13, 11], ['MagicBricks', 9, 6, 4], ['Housing.com', 6, 6, 4], ['Website', 6, 8, 6], ['Channel partners', 4, 5, 4]];
})();

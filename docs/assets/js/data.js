/* RealCognix OS — prototype data (fictitious; for demonstration only) */
(function () {
  'use strict';
  var D = {};

  D.clients = [
    { id: 'ccd', name: 'Coastal Crest Developers', short: 'Coastal Crest', city: 'Mangaluru', status: 'Active', projects: 2, budget: 6.5, leadsMTD: 412, bookings: 9, am: 'Ananya R.', since: 'Jun 2026', rera: 'Verified', health: 'On track' },
    { id: 'nhb', name: 'Nandi Heights Builders', short: 'Nandi Heights', city: 'Bengaluru', status: 'Active', projects: 2, budget: 12, leadsMTD: 508, bookings: 11, am: 'Karthik S.', since: 'Apr 2026', rera: 'Verified', health: 'On track' },
    { id: 'sye', name: 'Sahyadri Estates', short: 'Sahyadri', city: 'Mysuru', status: 'Active', projects: 1, budget: 3.2, leadsMTD: 146, bookings: 3, am: 'Fathima N.', since: 'Aug 2026', rera: 'Verified', health: 'At risk' },
    { id: 'dar', name: 'Deccan Arc Realty', short: 'Deccan Arc', city: 'Hyderabad', status: 'Active', projects: 1, budget: 8, leadsMTD: 218, bookings: 4, am: 'Rohan D.', since: 'Sep 2026', rera: 'Verified', health: 'On track' },
    { id: 'svi', name: 'Sahyog Ventures Infra', short: 'Sahyog', city: 'Pune', status: 'Onboarding', projects: 1, budget: 4.5, leadsMTD: 0, bookings: 0, am: 'Meera P.', since: 'Nov 2026', rera: 'Pending', health: 'Pending' },
    { id: 'ktl', name: 'Konkan Tides Living', short: 'Konkan Tides', city: 'Udupi', status: 'Onboarding', projects: 1, budget: 2.4, leadsMTD: 0, bookings: 0, am: 'Vikram K.', since: 'Nov 2026', rera: 'Needs review', health: 'Pending' }
  ];

  D.projects = [
    { id: 'p-tidewater', name: 'Tidewater Residences', city: 'Mangaluru', locality: 'Kadri Hills', client: 'ccd', config: '2 & 3 BHK', priceRange: [68, 142], rera: 'PRM/KA/RERA/1257/334/PR/240611/006812', possession: 'Dec 2028', units: 168, sold: 74, held: 9, status: 'Live', mono: '' },
    { id: 'p-baywalk', name: 'Baywalk Villas', city: 'Mangaluru', locality: 'Kotekar', client: 'ccd', config: '4 BHK villas', priceRange: [245, 310], rera: 'PRM/KA/RERA/1257/334/PR/250114/007120', possession: 'Jun 2028', units: 42, sold: 15, held: 3, status: 'Live', mono: 't' },
    { id: 'p-skyline', name: 'Nandi Skyline', city: 'Bengaluru', locality: 'Yelahanka', client: 'nhb', config: '2, 3 & 4 BHK', priceRange: [92, 228], rera: 'PRM/KA/RERA/1251/309/PR/240302/006511', possession: 'Mar 2029', units: 412, sold: 196, held: 18, status: 'Live', mono: 's' },
    { id: 'p-orchard', name: 'Orchard Row', city: 'Bengaluru', locality: 'Hebbal', client: 'nhb', config: '3 BHK', priceRange: [138, 176], rera: 'PRM/KA/RERA/1251/309/PR/250820/007744', possession: 'Sep 2029', units: 120, sold: 22, held: 6, status: 'Live', mono: 'a' },
    { id: 'p-chamundi', name: 'Chamundi View', city: 'Mysuru', locality: 'JP Nagar', client: 'sye', config: '2 & 3 BHK', priceRange: [54, 96], rera: 'PRM/KA/RERA/1268/446/PR/240917/006990', possession: 'Jun 2028', units: 96, sold: 31, held: 4, status: 'Live', mono: 't' },
    { id: 'p-arcadia', name: 'Arc Meridian', city: 'Hyderabad', locality: 'Kokapet', client: 'dar', config: '3 & 4 BHK', priceRange: [165, 290], rera: 'P02400008817', possession: 'Dec 2029', units: 260, sold: 48, held: 12, status: 'Live', mono: '' },
    { id: 'p-sahyog', name: 'Sahyog Greens', city: 'Pune', locality: 'Wakad', client: 'svi', config: '2 & 3 BHK', priceRange: [82, 134], rera: 'P52100079112', possession: 'Mar 2029', units: 180, sold: 0, held: 0, status: 'Draft', mono: 's' }
  ];
  D.unitTypes = [
    { t: '2 BHK Classic', carpet: 812, sbua: 1180, price: 68, facing: 'East / North', units: 64 },
    { t: '2 BHK Corner', carpet: 868, sbua: 1255, price: 74.5, facing: 'East', units: 32 },
    { t: '3 BHK Signature', carpet: 1148, sbua: 1640, price: 104, facing: 'North / West', units: 56 },
    { t: '3 BHK Sky Deck', carpet: 1296, sbua: 1860, price: 142, facing: 'West (sea view)', units: 16 }
  ];

  var first = ['Rahul', 'Priya', 'Sandeep', 'Divya', 'Mohammed', 'Sneha', 'Arvind', 'Kavya', 'Nikhil', 'Lakshmi', 'Rakesh', 'Aishwarya', 'Prakash', 'Shruti', 'Imran', 'Deepa', 'Vinay', 'Pooja', 'Suresh', 'Anjali', 'Harish', 'Neha', 'Abdul', 'Ramya', 'Gautham', 'Swathi', 'Manoj', 'Bhavana', 'Joseph', 'Nithya', 'Kiran', 'Rashmi', 'Varun', 'Meghana', 'Sachin', 'Farah', 'Ashwin', 'Sindhu', 'Tejas', 'Reshma'];
  var last = ['Shetty', 'Nair', 'Kamath', 'Rao', 'Hegde', 'Pai', 'Reddy', 'Iyer', 'Menon', 'Gowda', 'Bhat', 'Fernandes', 'Kulkarni', 'Prabhu', 'Khan', 'D\'Souza', 'Acharya', 'Naik', 'Sharma', 'Joshi'];
  var stages = ['New', 'Contacted', 'Qualified', 'Visit scheduled', 'Visited', 'Negotiation', 'Booked', 'Lost'];
  var stageW = [8, 9, 7, 6, 4, 3, 2, 1];
  var sources = ['Meta Lead Ads', 'Google Search', 'Meta Lead Ads', '99acres', 'MagicBricks', 'Website', 'Housing.com', 'Channel partner', 'Google PMax', 'Meta Lead Ads'];
  var owners = ['Ananya R.', 'Karthik S.', 'Fathima N.', 'Rohan D.', 'Meera P.', 'Vikram K.'];
  var live = D.projects.filter(function (p) { return p.status === 'Live'; });
  var seed = 7;
  function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
  function pickW(arr, w) { var s = 0, r = rnd() * w.reduce(function (a, b) { return a + b; }, 0); for (var i = 0; i < arr.length; i++) { s += w[i]; if (r < s) return arr[i]; } return arr[0]; }
  var ago = ['4 min ago', '11 min ago', '26 min ago', '1 h ago', '2 h ago', '3 h ago', 'Today 9:12', 'Yesterday', 'Yesterday', '2 days ago', '3 days ago', '5 days ago'];
  D.leads = [];
  for (var i = 0; i < 40; i++) {
    var p = live[i % live.length];
    var stage = i < 6 ? 'New' : pickW(stages, stageW);
    var score = Math.round(28 + rnd() * 68);
    if (stage === 'Booked' || stage === 'Negotiation') score = Math.max(score, 82);
    if (stage === 'Lost') score = Math.min(score, 40);
    var bhk = p.config.indexOf('4') > -1 && rnd() > .5 ? '4 BHK' : (rnd() > .45 ? '3 BHK' : '2 BHK');
    if (p.config === '4 BHK villas') bhk = '4 BHK villa';
    var budget = Math.round(p.priceRange[0] + rnd() * (p.priceRange[1] - p.priceRange[0]));
    var name = first[i] + ' ' + last[(i * 7) % last.length];
    var ph = '+91 9' + String(80000 + Math.floor(rnd() * 19999)).slice(0, 4) + ' •••' + String(10 + Math.floor(rnd() * 89));
    var src = sources[i % sources.length];
    D.leads.push({
      id: 'L-' + (24180 + i), name: name, phone: ph, project: p.name, projectId: p.id, client: p.client, budget: budget, bhk: bhk,
      source: src, score: score, stage: stage, owner: owners[i % owners.length], created: ago[i % ago.length],
      slaMins: stage === 'New' ? [2, 4, 1, 6, 3, 0][i % 6] : null, nri: i % 9 === 4, lang: ['Kannada', 'English', 'Hindi', 'Tulu', 'Malayalam', 'Telugu'][i % 6],
      consent: i % 13 !== 7, purpose: i % 3 === 0 ? 'Investment' : 'Self use', timeline: rnd() > .5 ? 'Within 3 months' : '3–6 months', loan: rnd() > .35
    });
  }
  D.leadTimeline = [
    { t: '<b>Lead captured</b> from {source} form with consent recorded', m: '{created}', cls: '' },
    { t: '<b>Duplicate check</b> passed · scored {score} by Lead Qualifier', m: '+8 sec', cls: 'ai' },
    { t: '<b>WhatsApp sent</b> · template welcome_brochure with project brochure', m: '+21 sec', cls: 'ai' },
    { t: '<b>Assigned to {owner}</b> by round-robin (language match: {lang})', m: '+24 sec', cls: '' },
    { t: '<b>Call connected</b> · 4 min 12 s · budget and timeline confirmed', m: '+3 min 40 s', cls: 'hl' },
    { t: '<b>Follow-up cadence</b> Day 0/1/3/7 started', m: '+4 min', cls: 'ai' }
  ];

  D.notifications = [
    { t: '3 hot leads waiting more than 5 minutes', m: 'Nandi Skyline · auto-reassign in 1 min', icon: 'timer', go: '#/leads' },
    { t: '4 creatives awaiting your approval', m: 'Creative agent · Tidewater Diwali offer', icon: 'image', go: '#/campaigns' },
    { t: 'Booking confirmed · Unit B-1204', m: 'Nandi Skyline · ₹1.62 Cr · token received', icon: 'filecheck', go: '#/bookings' },
    { t: 'Meta CPL up 22% on Chamundi View', m: 'Campaign Optimizer suggests a budget shift', icon: 'alert', go: '#/campaigns' },
    { t: 'Weekly report ready for Coastal Crest', m: 'Reporting agent · review before sharing', icon: 'chart', go: '#/reports' }
  ];

  D.campaigns = [
    { id: 'c1', name: 'Tidewater · Lead form · Mangaluru 25 km', channel: 'Meta', client: 'ccd', status: 'Active', spend: 182400, leads: 214, qualPct: 38, visits: 41, cpl: 852, cpv: 4449, suggestion: 'Move ₹15k from broad to lookalike 1%' },
    { id: 'c2', name: 'Tidewater · Search · 3 BHK Kadri', channel: 'Google Search', client: 'ccd', status: 'Active', spend: 96500, leads: 71, qualPct: 54, visits: 22, cpl: 1359, cpv: 4386, suggestion: 'Add negative keyword "rent"' },
    { id: 'c3', name: 'Nandi Skyline · PMax · North Bengaluru', channel: 'Google PMax', client: 'nhb', status: 'Learning', spend: 241000, leads: 188, qualPct: 31, visits: 37, cpl: 1282, cpv: 6514, suggestion: 'Wait: learning ends in 3 days' },
    { id: 'c4', name: 'Nandi Skyline · Meta · IT corridor', channel: 'Meta', client: 'nhb', status: 'Active', spend: 205300, leads: 266, qualPct: 35, visits: 49, cpl: 772, cpv: 4190, suggestion: 'Refresh creative: frequency 3.8' },
    { id: 'c5', name: 'Orchard Row · YouTube · walkthrough', channel: 'YouTube', client: 'nhb', status: 'Active', spend: 64000, leads: 22, qualPct: 45, visits: 7, cpl: 2909, cpv: 9143, suggestion: 'Shift to retargeting viewers' },
    { id: 'c6', name: 'Chamundi View · Meta · Mysuru city', channel: 'Meta', client: 'sye', status: 'Active', spend: 88200, leads: 97, qualPct: 22, visits: 12, cpl: 909, cpv: 7350, suggestion: 'CPL up 22%: tighten to 15 km' },
    { id: 'c7', name: 'Arc Meridian · 99acres premium listing', channel: '99acres', client: 'dar', status: 'Active', spend: 75000, leads: 64, qualPct: 41, visits: 14, cpl: 1172, cpv: 5357, suggestion: '' },
    { id: 'c8', name: 'Arc Meridian · MagicBricks featured', channel: 'MagicBricks', client: 'dar', status: 'Paused', spend: 42000, leads: 23, qualPct: 26, visits: 3, cpl: 1826, cpv: 14000, suggestion: 'Keep paused: cost per visit 2.6× target' },
    { id: 'c9', name: 'All projects · WhatsApp re-engagement', channel: 'WhatsApp', client: 'ccd', status: 'Active', spend: 6800, leads: 38, qualPct: 61, visits: 9, cpl: 179, cpv: 756, suggestion: 'Send to 1,140 opted-in cold leads' },
    { id: 'c10', name: 'Baywalk Villas · Retargeting · NRI Gulf', channel: 'Meta', client: 'ccd', status: 'Active', spend: 54600, leads: 31, qualPct: 48, visits: 5, cpl: 1761, cpv: 10920, suggestion: 'Schedule ads for 7–10 pm GST' }
  ];
  D.creatives = [
    { id: 'cr1', project: 'Tidewater Residences', type: 'Meta lead ad · 1:1', headline: 'Sea-facing 3 BHK homes in Kadri Hills', body: 'From ₹1.04 Cr all-in. RERA registered. Site visits daily 10 am to 6 pm.', check: 'Passed', by: 'Creative agent' },
    { id: 'cr2', project: 'Tidewater Residences', type: 'Meta story · 9:16', headline: 'This Diwali, come home to Kadri Hills', body: 'Book a site visit this week. Price list and floor plans on WhatsApp.', check: 'Passed', by: 'Creative agent' },
    { id: 'cr3', project: 'Chamundi View', type: 'Google RSA', headline: '2 BHK in JP Nagar Mysuru | From ₹54 L', body: 'RERA approved. 5 min to Ring Road. Book a visit.', check: 'Passed', by: 'Creative agent' },
    { id: 'cr4', project: 'Nandi Skyline', type: 'Meta lead ad · 4:5', headline: 'Guaranteed returns near the airport', body: 'Invest now and earn assured rent.', check: 'Blocked', reason: 'Assured-return claims are not allowed under RERA advertising rules and Meta housing policy.', by: 'Creative agent' }
  ];

  D.conversations = [
    { id: 'v1', lead: 'L-24180', name: 'Rahul Shetty', channel: 'WhatsApp', project: 'Tidewater Residences', time: '2 min', unread: true,
      msgs: [['in', 'Hi, I saw the ad for Tidewater. Is the 3 BHK still available on a higher floor?', '10:41'], ['out', 'Hello Rahul, thank you for your interest in Tidewater Residences. Sharing the brochure and price list here. Higher floors (9 to 14) are available in 3 BHK Signature.', '10:41 · auto · welcome_brochure'], ['in', 'What is the all-in price for a west-facing one? And is there a car park included?', '10:44']],
      draft: 'The 3 BHK Signature on floors 9 to 14, west facing, is ₹1.08 Cr to ₹1.12 Cr all-in, including one covered car park. Would you like to see it this Saturday? I can hold a 11 am or 4 pm slot for you.', template: null },
    { id: 'v2', lead: 'L-24183', name: 'Divya Rao', channel: 'WhatsApp', project: 'Orchard Row', time: '9 min', unread: true,
      msgs: [['in', 'Can I get a floor plan of the 3 BHK?', '10:30']], draft: 'Of course, Divya. Here is the 3 BHK floor plan for Orchard Row (1,412 sq ft carpet). Would a weekday or weekend visit suit you better?', template: null },
    { id: 'v3', lead: 'L-24190', name: 'Rakesh Kulkarni', channel: 'Email', project: 'Arc Meridian', time: '1 h', unread: false,
      msgs: [['in', 'Please share the payment plan and whether HDFC and SBI have approved the project.', '09:18']], draft: 'Dear Rakesh, Arc Meridian is approved by HDFC, SBI and ICICI Home Finance. The payment plan is 10% on booking, 20% on agreement, and the balance linked to construction stages. I have attached the full schedule.', template: null },
    { id: 'v4', lead: 'L-24186', name: 'Arvind Iyer', channel: 'Portal', project: 'Nandi Skyline', time: '2 h', unread: false,
      msgs: [['in', '99acres enquiry: Interested in 2 BHK, budget 95 L, need possession by 2029.', '08:52'], ['out', 'Hello Arvind, Nandi Skyline 2 BHK starts at ₹92 L with possession in March 2029. Sharing details on WhatsApp now.', '08:53 · auto']], draft: 'Following up, Arvind: we have two east-facing 2 BHK homes within ₹95 L on floors 6 and 8. Shall I book a visit for this weekend?', template: 'followup_visit_invite' },
    { id: 'v5', lead: 'L-24192', name: 'Prakash Kamath', channel: 'WhatsApp', project: 'Baywalk Villas', time: 'Yesterday', unread: false,
      msgs: [['in', 'I am in Dubai, coming home in December. Can we do a video walkthrough first?', 'Yesterday 21:10'], ['out', 'Certainly, Prakash. Our team runs video walkthroughs at 7 pm GST on weekdays. Shall I schedule one for Thursday?', 'Yesterday 21:11 · auto']], draft: 'Confirming your video walkthrough of Baywalk Villas on Thursday at 7 pm GST (8:30 pm IST). Vikram will host it on WhatsApp video.', template: 'visit_confirmation' },
    { id: 'v6', lead: 'L-24195', name: 'Anjali Nair', channel: 'WhatsApp', project: 'Chamundi View', time: 'Yesterday', unread: false,
      msgs: [['in', 'Thanks for the visit today. We liked the 2 BHK, need to discuss with family.', 'Yesterday 17:40']], draft: 'Thank you for visiting Chamundi View, Anjali. Take your time. I am sharing the cost sheet for the unit you liked, A-504, and can hold it for 48 hours if that helps.', template: null }
  ];

  ['cadences', 'routingRules', 'visits', 'bookings', 'partners', 'team', 'agents', 'approvals', 'runlog', 'integrations', 'reports'].forEach(function (k) { D[k] = []; });
  window.RC.data = D;
})();

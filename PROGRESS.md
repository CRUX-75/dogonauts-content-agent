\# 🚀 Dogonauts Content Agent - Progress Report



\*\*Date:\*\* September 30, 2025  

\*\*Project:\*\* Multi-Agent Content Automation System  

\*\*Platform:\*\* n8n + Supabase + Claude API



---



\## ✅ Completed Infrastructure Setup



\### 1. \*\*Docker + n8n (Local VPS)\*\*

\- Docker Desktop installed on Windows 11

\- n8n running on `http://localhost:5678`

\- Container: `dogonauts-n8n`

\- Login: `admin` / `dogonauts2025`

\- Network: `dogonauts-network`

\- Volumes configured: `./n8n-data`, `./workflows`



\*\*Location:\*\* `C:\\Development\\dogonauts-content-agent`



\### 2. \*\*Supabase Database\*\*

\- Project created: `dogonauts-content-agent`

\- Region: Europe West (Frankfurt)

\- Plan: Free tier



\*\*Tables created:\*\*

\- ✅ `campaigns` (id, name, active\_from, active\_to, priority, tags, locales)

\- ✅ `products` (id, name, brand, category, description, active)

\- ✅ `product\_assets` (id, product\_id, file\_path, storage\_url, variant\_type, is\_primary)

\- ✅ `post\_history` (id, campaign\_id, product\_id, copy\_text, fb\_post\_id, ig\_post\_id, performance\_score)



\*\*Test data inserted:\*\*

\- Campaign: "Halloween 2025" (2025-10-15 to 2025-11-01, priority 1)

\- Product: "Rinti Kennerfleisch Huhn 800g" (brand: Rinti, category: Futter)



\### 3. \*\*n8n ↔ Supabase Connection\*\*

\- Credential configured: "Supabase Dogonauts"

\- Test workflow created and executed successfully

\- Query returned Halloween 2025 campaign correctly



---



\## 🗂️ Project Structure



```

Dogonauts\_Content\_Agent/

├── docker-compose.yml          # n8n configuration

├── .env                        # API keys (to be added)

├── .gitignore                 # Protects secrets

├── n8n-data/                  # n8n workflows \& settings

├── workflows/                 # Workflow exports

└── README.md                  # Project documentation

```



---



\## 🎯 Architecture Decided: Multi-Agent System



\### Agent Overview:



```

1\. Campaign Strategist 🎯

&nbsp;  └─> Decides content type, product, tone, format



2\. Copywriting Agent ✍️ (Claude Sonnet 4)

&nbsp;  └─> Generates German copy (3 variants)



3\. Visual Design Agent 🎨

&nbsp;  ├─> 3A: Nanobana (background generation)

&nbsp;  ├─> 3B: Asset Selector (product PNGs from Supabase)

&nbsp;  └─> 3C: Canva API (composition)



4\. Animation Agent 🎬 (Optional)

&nbsp;  └─> Nanobana Video (15s animated posts)



5\. Quality Assurance ✅

&nbsp;  └─> Automated checks + Telegram approval



6\. Publishing Agent 📱

&nbsp;  └─> Meta API (Facebook + Instagram)



7\. Analytics \& Learning 📊

&nbsp;  └─> Performance tracking + feedback loop

```



---



\## 📝 Next Steps (Priority Order)



\### \*\*Phase 1: Core Content Generation (Week 1)\*\*



\#### Step 1: Configure API Keys

\*\*File:\*\* `.env` in project root



```bash

\# Add these keys:

ANTHROPIC\_API\_KEY=sk-ant-your-key-here

SUPABASE\_URL=https://xxxxx.supabase.co

SUPABASE\_SERVICE\_KEY=your-service-role-key

```



\*\*Action items:\*\*

1\. Get Anthropic API key from: https://console.anthropic.com/

2\. Copy Supabase URL and service\_role key from Supabase Settings → API

3\. Save in `.env` file



---



\#### Step 2: Agent 1 - Campaign Strategist

\*\*Workflow name:\*\* `Agent 1 - Campaign Strategist`



\*\*Nodes to create:\*\*



1\. \*\*Schedule Trigger\*\*

&nbsp;  - Cron: `0 19 \* \* 1,3,5` (Mon/Wed/Fri 19:00)



2\. \*\*Supabase: Get Active Campaign\*\*

&nbsp;  - Operation: Get Many Rows

&nbsp;  - Table: `campaigns`

&nbsp;  - Filters:

&nbsp;    - `active\_from` <= today

&nbsp;    - `active\_to` >= today

&nbsp;  - Sort: `priority` ASC

&nbsp;  - Limit: 1



3\. \*\*Function: Content Strategy Logic\*\*

&nbsp;  ```javascript

&nbsp;  // Decide content type based on day

&nbsp;  const dayOfWeek = new Date().getDay();

&nbsp;  let contentType;

&nbsp;  

&nbsp;  if (dayOfWeek === 1) { // Monday

&nbsp;    contentType = 'product';

&nbsp;  } else if (dayOfWeek === 3) { // Wednesday

&nbsp;    contentType = 'education';

&nbsp;  } else { // Friday

&nbsp;    contentType = 'lifestyle';

&nbsp;  }

&nbsp;  

&nbsp;  return {

&nbsp;    json: {

&nbsp;      campaign: $input.item.json,

&nbsp;      contentType: contentType,

&nbsp;      needsProduct: contentType === 'product'

&nbsp;    }

&nbsp;  };

&nbsp;  ```



4\. \*\*IF Node: Needs Product?\*\*

&nbsp;  - Condition: `{{ $json.needsProduct }}` = true



5\. \*\*Supabase: Get Random Product\*\* (if TRUE branch)

&nbsp;  - Operation: Get Many Rows

&nbsp;  - Table: `products`

&nbsp;  - Filter: `active` = true

&nbsp;  - Random selection via Function node



\*\*Test:\*\* Execute workflow manually, verify it returns campaign + strategy.



---



\#### Step 3: Agent 2 - Copywriting (Claude API)

\*\*Workflow name:\*\* `Agent 2 - Copywriting`



\*\*Add to existing workflow:\*\*



1\. \*\*HTTP Request: Claude API\*\*

&nbsp;  - Method: POST

&nbsp;  - URL: `https://api.anthropic.com/v1/messages`

&nbsp;  - Headers:

&nbsp;    - `x-api-key`: `{{ $env.ANTHROPIC\_API\_KEY }}`

&nbsp;    - `anthropic-version`: `2023-06-01`

&nbsp;    - `Content-Type`: `application/json`

&nbsp;  

&nbsp;  - Body:

&nbsp;  ```json

&nbsp;  {

&nbsp;    "model": "claude-sonnet-4-20250514",

&nbsp;    "max\_tokens": 2000,

&nbsp;    "temperature": 0.7,

&nbsp;    "system": "You are Dogonauts Copywriter AI. Generate 3 German social media posts (short/medium/long) for campaign: {{ $json.campaign.name }}. Output ONLY valid JSON with structure: {\\"posts\\": \[{\\"variant\\": \\"short\\", \\"text\\": \\"...\\", \\"cta\\": \\"Jetzt shoppen\\", \\"hashtags\\": \[\\"#Dogonauts\\", \\"#Halloween2025\\"]}]}",

&nbsp;    "messages": \[

&nbsp;      {

&nbsp;        "role": "user",

&nbsp;        "content": "Generate posts for {{ $json.campaign.name }}"

&nbsp;      }

&nbsp;    ]

&nbsp;  }

&nbsp;  ```



2\. \*\*Function: Parse Claude Response\*\*

&nbsp;  ```javascript

&nbsp;  const response = $input.item.json;

&nbsp;  const content = response.content\[0].text;

&nbsp;  const cleaned = content.replace(/```json\\n?/g, '').replace(/```/g, '').trim();

&nbsp;  const parsed = JSON.parse(cleaned);

&nbsp;  

&nbsp;  // Select medium variant

&nbsp;  const mediumPost = parsed.posts.find(p => p.variant === 'medium');

&nbsp;  

&nbsp;  return {

&nbsp;    json: {

&nbsp;      campaign: $('Supabase: Get Active Campaign').item.json,

&nbsp;      copy: mediumPost.text,

&nbsp;      cta: mediumPost.cta,

&nbsp;      hashtags: mediumPost.hashtags.join(' '),

&nbsp;      fullCaption: `${mediumPost.text}\\n\\n${mediumPost.hashtags.join(' ')}`

&nbsp;    }

&nbsp;  };

&nbsp;  ```



\*\*Test:\*\* Run workflow, verify German copy is generated correctly.



---



\### \*\*Phase 2: Product Asset Library (Week 2)\*\*



\#### Step 4: Setup Supabase Storage

1\. In Supabase, go to \*\*Storage\*\*

2\. Create bucket: `dogonauts-assets`

3\. Make it \*\*public\*\*

4\. Create folders:

&nbsp;  - `products/`

&nbsp;  - `brand/`



\#### Step 5: Prepare Product Images

\*\*For top 5-10 products:\*\*

1\. Take photos or get from suppliers

2\. Remove background using: https://www.remove.bg/

3\. Optimize PNGs: https://tinypng.com/

4\. Naming convention: `{brand}\_{product}\_{variant}\_main.png`

&nbsp;  - Example: `rinti\_huhn\_800g\_main.png`



\#### Step 6: Upload Assets

1\. Upload to Supabase Storage

2\. Insert metadata to `product\_assets` table:

&nbsp;  - product\_id (from products table)

&nbsp;  - file\_path

&nbsp;  - storage\_url (public URL)

&nbsp;  - variant\_type: 'main'

&nbsp;  - is\_primary: true



\*\*Upload script (can run from n8n):\*\*

```javascript

// Get public URL

const publicUrl = supabase.storage

&nbsp; .from('dogonauts-assets')

&nbsp; .getPublicUrl('products/rinti\_huhn\_800g\_main.png');



// Insert metadata

await supabase.table('product\_assets').insert({

&nbsp; product\_id: 'uuid-from-products-table',

&nbsp; file\_path: 'products/rinti\_huhn\_800g\_main.png',

&nbsp; storage\_url: publicUrl.data.publicUrl,

&nbsp; variant\_type: 'main',

&nbsp; is\_primary: true

});

```



---



\### \*\*Phase 3: Visual Generation (Week 3)\*\*



\#### Step 7: Nanobana Integration

\*\*Get API key:\*\* https://www.nanobana.com/



\*\*Add to workflow:\*\*



1\. \*\*HTTP Request: Nanobana Background\*\*

&nbsp;  - If contentType !== 'product\_pure'

&nbsp;  - Generate contextual background (space theme, lifestyle)



2\. \*\*Supabase: Get Product Asset\*\*

&nbsp;  - Query `product\_assets` table

&nbsp;  - Filter by product\_id + variant\_type = 'main'



3\. \*\*Canva API: Composition\*\* (or ImageMagick alternative)

&nbsp;  - Layer 1: Background (Nanobana)

&nbsp;  - Layer 2: Product PNG (Supabase)

&nbsp;  - Layer 3: Brand logo

&nbsp;  - Layer 4: Text overlay (copy from Claude)

&nbsp;  - Output: 1080x1080 for IG



---



\### \*\*Phase 4: Publishing (Week 4)\*\*



\#### Step 8: Meta API Setup

1\. Go to: https://developers.facebook.com/

2\. Create Facebook App

3\. Add Products:

&nbsp;  - Facebook Login

&nbsp;  - Pages API

4\. Get Page Access Token (long-lived)

5\. Get Page ID and Instagram Business Account ID



\*\*Add to `.env`:\*\*

```

FACEBOOK\_PAGE\_ID=123456789

FACEBOOK\_ACCESS\_TOKEN=EAABsb...

INSTAGRAM\_ACCOUNT\_ID=987654321

```



\#### Step 9: Publishing Node

\*\*HTTP Request: Post to Facebook\*\*

\- URL: `https://graph.facebook.com/v21.0/{{ $env.FACEBOOK\_PAGE\_ID }}/feed`

\- Method: POST

\- Body:

&nbsp; ```json

&nbsp; {

&nbsp;   "message": "{{ $json.fullCaption }}",

&nbsp;   "link": "https://dogonauts.de",

&nbsp;   "access\_token": "{{ $env.FACEBOOK\_ACCESS\_TOKEN }}"

&nbsp; }

&nbsp; ```



\*\*HTTP Request: Post to Instagram\*\*

\- URL: `https://graph.facebook.com/v21.0/{{ $env.INSTAGRAM\_ACCOUNT\_ID }}/media`

\- Two-step process:

&nbsp; 1. Create media container

&nbsp; 2. Publish container



---



\### \*\*Phase 5: QA \& Approval (Week 5)\*\*



\#### Step 10: Telegram Bot Integration

1\. Create bot: https://t.me/BotFather

2\. Get bot token

3\. Get your chat ID



\*\*Add QA Node before Publishing:\*\*



1\. \*\*Telegram: Send Preview\*\*

&nbsp;  - Send image + caption

&nbsp;  - Inline keyboard: \[✅ Publish] \[❌ Reject] \[🔄 Retry]



2\. \*\*Wait for Approval\*\*

&nbsp;  - Webhook listener for callback

&nbsp;  - If approved → continue to publishing

&nbsp;  - If rejected → stop and log

&nbsp;  - If retry → back to copywriting



---



\### \*\*Phase 6: Analytics (Week 6+)\*\*



\#### Step 11: Analytics Agent

\*\*Workflow:\*\* Scheduled 24h after each post



1\. \*\*Meta Insights API\*\*

&nbsp;  - Fetch engagement metrics

&nbsp;  - Calculate performance score



2\. \*\*Update Supabase\*\*

&nbsp;  - Save metrics to `post\_history`

&nbsp;  - Tag high performers (score > 8)



3\. \*\*Feedback Loop\*\*

&nbsp;  - If high performer → tag for recycling (90 days)

&nbsp;  - Extract patterns for Campaign Strategist



---



\## 🔑 API Keys Needed



Checklist of accounts to create:



\- \[ ] Anthropic (Claude API) - https://console.anthropic.com/

\- \[ ] Supabase (already created) ✅

\- \[ ] Nanobana (image/video generation) - https://www.nanobana.com/

\- \[ ] Canva API (optional, for composition) - https://www.canva.com/developers/

\- \[ ] Meta Developers (Facebook + Instagram) - https://developers.facebook.com/

\- \[ ] Telegram Bot (for approvals) - https://t.me/BotFather

\- \[ ] Remove.bg (optional, for background removal) - https://www.remove.bg/



---



\## 💰 Expected Monthly Costs



| Service | Cost | Usage |

|---------|------|-------|

| n8n (self-hosted) | $0-5 | VPS or local |

| Supabase | $0 | Free tier (<500MB) |

| Claude API | $2-5 | ~12 posts/month |

| Nanobana | $30-50 | Images + videos |

| Canva API | $13 | Pro plan (optional) |

| Meta API | $0 | Free |

| Telegram Bot | $0 | Free |

| \*\*Total\*\* | \*\*$45-73/month\*\* | |



vs. Full-service tools + manual work: ~$400-500/month



---



\## 🧪 Testing Checklist



Before going to production:



\### Infrastructure:

\- \[ ] n8n accessible at localhost:5678

\- \[ ] Docker container running (check with `docker ps`)

\- \[ ] Supabase project accessible

\- \[ ] All API keys in `.env` file



\### Database:

\- \[ ] Test campaign exists and is active

\- \[ ] Test product exists

\- \[ ] Can query campaigns from n8n

\- \[ ] Can query products from n8n



\### Workflows:

\- \[ ] Campaign Strategist returns correct data

\- \[ ] Copywriting generates German text

\- \[ ] Asset Selector finds product images

\- \[ ] Publishing posts to Facebook (test mode)

\- \[ ] Telegram approval works



---



\## 🚨 Common Issues \& Solutions



\### Docker not starting

```bash

\# Check Docker Desktop is running

docker info



\# Restart Docker Desktop

\# Or restart service:

sudo systemctl restart docker

```



\### n8n can't connect to Supabase

\- Verify service\_role key (not anon key)

\- Check host doesn't include `https://`

\- Ensure Supabase project is not paused



\### Claude API errors

\- Verify API key starts with `sk-ant-`

\- Check you have credits: https://console.anthropic.com/settings/billing

\- Model string must be exact: `claude-sonnet-4-20250514`



\### Meta API authentication fails

\- Use Page Access Token, not User Token

\- Token must be long-lived (not 1-hour temp)

\- Page must be published (not draft)



---



\## 📚 Resources



\### Documentation:

\- n8n Docs: https://docs.n8n.io/

\- Supabase Docs: https://supabase.com/docs

\- Claude API: https://docs.anthropic.com/

\- Meta Graph API: https://developers.facebook.com/docs/graph-api/



\### Community:

\- n8n Community: https://community.n8n.io/

\- Supabase Discord: https://discord.supabase.com/



---



\## 🎯 Success Metrics (3 Months)



Target KPIs:

\- ✅ 100% automation rate (12 posts/month with 0 manual work)

\- ✅ <5% human rejection in QA

\- ✅ +20% engagement vs manual posts

\- ✅ Consistent 3x/week posting

\- ✅ Cost <$75/month



---



\## 📞 Next Session Plan



When you resume:



1\. \*\*Quick status check\*\* (5 min)

&nbsp;  - Docker/n8n still running?

&nbsp;  - Supabase accessible?



2\. \*\*Continue with Agent 2\*\* (30 min)

&nbsp;  - Add Claude API credential to n8n

&nbsp;  - Create copywriting workflow

&nbsp;  - Test German copy generation



3\. \*\*Product library setup\*\* (45 min)

&nbsp;  - Upload first 5 product PNGs

&nbsp;  - Configure Supabase Storage

&nbsp;  - Create Asset Selector node



4\. \*\*End-to-end test\*\* (30 min)

&nbsp;  - Run full flow: Campaign → Copy → Asset

&nbsp;  - Verify output quality

&nbsp;  - Fix any issues



\*\*Estimated time:\*\* 2 hours



---



\## 💾 Backup Instructions



Before making major changes, backup:



```bash

\# Backup n8n data

cd C:\\Development\\dogonauts-content-agent

tar -czf n8n-backup-$(date +%Y%m%d).tar.gz n8n-data/



\# Export workflows

\# In n8n UI: Settings → Export → Select all → Download



\# Backup Supabase

\# Supabase → Database → Backups → Download

```



---



\## 🎉 What We Accomplished Today



Starting from zero infrastructure:

1\. ✅ Installed and configured Docker + n8n

2\. ✅ Created and configured Supabase project

3\. ✅ Built database schema with 4 tables

4\. ✅ Established n8n ↔ Supabase connection

5\. ✅ Defined complete multi-agent architecture

6\. ✅ Created detailed roadmap for next 6 weeks



\*\*Foundation is solid. Ready to build the agents.\*\* 🚀


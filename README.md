# Harsh Job Finder — सेटअप (बिना कोडिंग, सिर्फ़ क्लिक)

## यह क्या करेगा
- हर दिन 4 बार (09:00, 13:00, 18:00, 22:00 IST) GitHub अपने-आप Remote OK, Remotive, We Work Remotely (और जो कंपनियाँ आप `config/companies.json` में जोड़ेंगे उनके Greenhouse/Lever/Ashby पेज) से जॉब लाएगा।
- सिर्फ़ आपके रोल (customer support / success / fintech ops / tech support / sales support) वाली, hybrid/office/US-only/degree-mandatory/software-engineer को हटाकर।
- सैलरी: in-hand 45,000+ या CTC 6 LPA+ = eligible। सैलरी/देश साफ़ न हो तो "To Verify" टैब में।
- आपका डैशबोर्ड एक वेबसाइट-लिंक होगा (फ़ोन और Mac दोनों पर)।
- LinkedIn/Indeed खुद-ब-खुद क्रॉल नहीं होते (उनके नियम मना करते हैं); "Quick Searches" टैब में उनके तैयार सर्च-लिंक हैं।

## सेटअप (एक बार, लगभग 15 मिनट)
1. github.com पर फ्री अकाउंट बनाइए।
2. ऊपर "+" → **New repository** → नाम `job-finder` → **Public** चुनिए → Create।
3. "uploading an existing file" दबाकर ZIP खोले हुए फ़ोल्डर की सारी फ़ाइलें (core, fetch, docs, config, README) खींचकर डालिए → **Commit changes**।
4. **Add file → Create new file**। नाम में ठीक यही लिखिए: `.github/workflows/jobs.yml` और अंदर `jobs-workflow-copy.yml` फ़ाइल की पूरी सामग्री पेस्ट करके Commit कीजिए।
5. **Settings → Pages** → Source: "Deploy from a branch" → Branch: `main`, folder: `/docs` → Save। 1-2 मिनट में ऊपर आपका लिंक दिखेगा। वही आपका डैशबोर्ड है।
6. **Actions** टैब → "Find jobs" → **Run workflow**। पहली खोज तुरंत चलेगी। इसके बाद डैशबोर्ड रिफ्रेश कीजिए।

## ईमेल अलर्ट (वैकल्पिक)
resend.com पर फ्री अकाउंट → API key बनाइए → GitHub repo में Settings → Secrets and variables → Actions → दो secrets जोड़िए: `RESEND_API_KEY` और `EMAIL_TO` (आपका ईमेल)।

## ईमानदार सीमाएँ
- लाइव सोर्स-कनेक्शन मैं यहाँ टेस्ट नहीं कर पाया (मेरे पास इंटरनेट नहीं)। पहली Run में Actions लॉग और डैशबोर्ड का "Sources" हिस्सा बताएगा कि कौन सा चला (✅/❌)। जो फेल हो वह बाकी को नहीं रोकता।
- Saved/Applied स्टेटस उसी ब्राउज़र में रहता है; फ़ोन और Mac के बीच सिंक नहीं होता।
- रेपो Public है, यानी जॉब-लिस्ट सार्वजनिक है। आपका रिज्यूमे/स्टेटस इसमें नहीं जाता।
- Revolut, Sprinto, Sleek, Readdle, Fresh Prints जैसी कंपनियाँ तभी जुड़ेंगी जब उनका जॉब-सिस्टम (ATS) पक्का हो।
- खर्च: ₹0 (फ्री सीमाओं में)।

## Vercel par deploy (GitHub Pages ke badle, step 5 chhod dein)
1. vercel.com -> "Sign up with GitHub" -> Add New -> Project -> apni `job-finder` repo Import.
2. Framework Preset: **Other** | Build Command: khali | Output Directory: **docs** -> Deploy.
3. Jo link mile (xxx.vercel.app) wahi aapka dashboard hai. Phone me Share -> Add to Home Screen.
4. GitHub -> Actions -> "Find jobs" -> Run workflow. Har naya commit Vercel apne-aap deploy karta hai.
5. Agar Vercel "commit author" ka error de: Vercel -> Settings -> Git -> Deploy Hooks me hook banayein, URL ko GitHub secret `VERCEL_DEPLOY_HOOK` me daal dein.

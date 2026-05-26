# الدومينات — نفس safariomni.com (بدون دومين جديد)

## التقسيم

| من يفتح | الرابط | ماذا يرى |
|---------|--------|----------|
| **العميل** | **https://safariomni.com** | موقع الشركة (أسعار + طلب خدمة) |
| **الموظف** | **https://www.safariomni.com/login** | تسجيل دخول ERP (كما هو) |

نفس العائلة `safariomni.com` — **ما تحتاج تشتري دومين جديد**.

---

## كيف يشتغل تقنياً

- **safariomni.com** → السيرver (Render Web Service)
  - `/` = موقع العملاء
  - `/api/...` = الـ API
- **www.safariomni.com** → موقع ERP المنفصل (Render Static Site — موجود اليوم)

---

## بعد ما ترفع الكود (deploy)

1. Render يبني المشروع (Dockerfile يبني `apps/public-web` تلقائياً).
2. افتح **https://safariomni.com** — يجب يظهر موقع الشركة.
3. **https://www.safariomni.com/login** — ERP بدون تغيير.

---

## DNS (غالباً جاهز عندك)

| السجل | يشير إلى |
|-------|----------|
| `safariomni.com` | Render **Web Service** (API) |
| `www.safariomni.com` | Render **Static Site** (ERP) |

---

## محلياً

```powershell
npm run public-web:build   # مرة قبل تشغيل السيرver
npm run dev                # ثم افتح http://localhost:3000
npm run web:dev            # ERP: http://localhost:5173/login
```

---

## لا تحتاج Static Site ثاني لموقع الشركة

موقع العملاء يُخدم من **نفس سيرver الـ API** على `safariomni.com`.

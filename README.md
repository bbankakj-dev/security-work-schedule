# Security Work Schedule

เว็บแอปพลิเคชันบริหารตารางเวร รปภ., ขอสแปร์, ตรวจสอบมาตรฐาน GDDL (5/2), และสรุปตัดรอบเงินเดือน (23 ถึง 22)
พัฒนาด้วย **HTML5 + Tailwind CSS + Vue 3** รองรับการ Deploy บน **GitHub Pages** และ **Firebase Hosting**

---

## 🌟 ฟังก์ชันการทำงานตรงตามความต้องการทั้ง 6 ข้อ

1. **อ้างอิงตารางดราฟท์ รันรอบต่อไปอัตโนมัติ (Auto Next Cycle):**
   - มีปุ่ม `⚙️ รันรอบถัดไปอัตโนมัติ` พร้อมระบบหมุนกะ **Fireman 4 นาย**:
     - นายสมชาย ทุสุนา (Fireman 3) ➔ วันหยุด **อังคาร - พุธ คงที่ตลอดปี**
     - Fireman 1, 2, 4 ➔ หมุนเวียน 3 สเต็ป (`Fri-Sat ➔ Sun-Mon ➔ Sat-Sun ➔ Fri-Sat`)
2. **ระบบรองรับการทดแทนทั้ง 2 แบบ (Permanent Replacement & Vendor Spare):**
   - ตำแหน่งประจำ 39 คน (รวมอัตราว่าง/สรรหา No.31, 36, 39)
   - เมื่อมีคนลาหรือขาด สามารถเลือกบันทึกคนแทนได้ 2 แบบ:
     - **คนประจำมาแทน (OT / Cross-covering)**
     - **ขอสแปร์จาก บ.ต้นสังกัด (Spare Request)**
   - ระบบบันทึกชื่อผู้มาแทน และตรวจสอบมาตรฐาน GDDL ทันที
3. **ระบบแยกสิทธิ์การเข้าถึง (Role-Based Access Control - RBAC):**
   - **รปภ. ทั่วไป (Guard Mode):** สามารถเปิดเว็บดูตารางเวรรวม และเลือกรอบเงินเดือนเพื่อดูสรุปวันทำงานของตนเองได้ (Read-Only)
   - **Supervisor และ Site Manager (Admin Mode):** เข้าสู่ระบบด้วยรหัส PIN (ค่าเริ่มต้น: `1234`) เพื่อเปิดสิทธิ์แก้ไขตารางเวร บันทึกคนลา จัดสแปร์ และพิมพ์เอกสารวางบิล
4. **โครงสร้างพร้อมขึ้น GitHub และ Firebase:**
   - มีไฟล์ `firebase.json` และ `firestore.rules` พร้อมคำสั่ง `firebase deploy` ทันที
5. **ตัดรอบเงินเดือนวันที่ 23 ถึงวันที่ 22 ของเดือนถัดไป (Payday: วันที่ 1):**
   - แถบตารางแสดงวันที่เริ่มต้น 23 ถึง 22 ตรงตามรอบจริงของโรงงาน
   - มีป้ายแจ้งเตือนกำหนดจ่ายเงินเดือนทุกวันที่ 1
6. **หน้าสรุปรายบุคคลของ รปภ. (Personal View):**
   - รปภ. เลือกชื่อตนเอง จะเห็นสรุป:
     - ☀️ จำนวนวันกะเช้า (D) และจำนวนชั่วโมง
     - 🌙 จำนวนวันกะดึก (N) และจำนวนชั่วโมง
     - 🏖️ จำนวนวันหยุดประจำสัปดาห์ (H) ตามเกณฑ์ 5/2
     - 🎉 จำนวนวันหยุดนักขัตฤกษ์ (PH)
     - ผลตรวจความปลอดภัย GDDL (ไม่เกิน 60 ชม./สัปดาห์)

---

## 🚀 วิธีการทดสอบใช้งานทันที (Offline / Local)

คุณสามารถเปิดใช้งานระบบได้ทันทีบนคอมพิวเตอร์ของคุณ:
1. ไปที่โฟลเดอร์: `C:\Users\sm-continental\.gemini\antigravity\scratch\security_web_portal\public\`
2. ดับเบิ้ลคลิกไฟล์ `index.html` เพื่อเปิดบน Chrome / Edge ได้ทันที!
3. สิทธิ์การใช้งาน:
   - รปภ. ทั่วไป: ใช้งานได้ทันที
   - Supervisor: กดปุ่ม **"เข้าสู่ระบบ Sup"** มุมขวาบน แล้วใส่ PIN: `1234`

---

## 🌐 วิธีนำขึ้น GitHub & Firebase Hosting

### 1. นำขึ้น GitHub Repository
เปิด PowerShell หรือ Command Prompt ในโฟลเดอร์ `security_web_portal`:
```bash
cd C:\Users\sm-continental\.gemini\antigravity\scratch\security_web_portal
git init
git add .
git commit -m "Initial commit: Continental Security Schedule & Spare System"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/security-schedule-portal.git
git push -u origin main
```

### 2. Deploy ขึ้น Firebase Hosting
1. ติดตั้ง Firebase CLI (หากยังไม่มี):
   ```bash
   npm install -g firebase-tools
   ```
2. ล็อกอินและเชื่อมต่อโปรเจกต์:
   ```bash
   firebase login
   firebase init
   ```
   *(เลือก Hosting ➔ เลือกโปรเจกต์ Firebase ของคุณ ➔ ใช้โฟลเดอร์ `public`)*
3. สั่ง Deploy ขึ้นเว็บออนไลน์:
   ```bash
   firebase deploy
   ```
4. คุณจะได้ URL เว็บไซต์ เช่น `https://continental-security-schedule.web.app` ส่งให้ทีม รปภ. และ Supervisor เปิดใช้งานได้ทันทีบนทุกอุปกรณ์!

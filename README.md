# Security Work Schedule

เว็บแอปพลิเคชันบริหารตารางเวร รปภ., ขอสแปร์, ตรวจสอบมาตรฐาน GDDL (5/2), และสรุปตัดรอบเงินเดือน (23 ถึง 22)
พัฒนาด้วย **HTML5 + Tailwind CSS + Vue 3** รองรับการ Deploy บน **GitHub Pages** และ **Firebase Hosting**

---

## 🌟 ฟังก์ชันการทำงานตรงตามความต้องการทั้ง 6 ข้อ

1. **อ้างอิงตารางดราฟท์ รันรอบต่อไปอัตโนมัติ (Auto Next Cycle):**
   - ระบบหมุนกะ **Fireman 4 นาย**:
     - นายสมชาย ทุสุนา (Fireman 4) ➔ วันหยุด **อังคาร - พุธ คงที่ตลอดปี**
   - Fireman 1, 2, 3 ➔ หมุนเวียนทุกรอบเงินเดือน: หยุด **ศ-ส ➔ อา-จ ➔ ส-อา ➔ ศ-ส**
   - วันหยุดของทุกตำแหน่งยึดตาม "วันในสัปดาห์" (ไม่ใช่วันที่) อ้างอิง Master Draft เริ่มจันทร์ 23 พ.ย. 2026
2. **ระบบรองรับการทดแทนทั้ง 2 แบบ (Permanent Replacement & Vendor Spare):**
   - ตำแหน่งประจำ 39 คน (รวมอัตราว่าง/สรรหา No.21, 31, 36, 39)
   - เมื่อมีคนลาหรือขาด สามารถเลือกบันทึกคนแทนได้ 2 แบบ:
     - **คนประจำมาแทน (OT / Cross-covering)**
     - **ขอสแปร์จาก บ.ต้นสังกัด (Spare Request)**
   - ระบบบันทึกชื่อผู้มาแทน และตรวจสอบมาตรฐาน GDDL ทันที
3. **ระบบแยกสิทธิ์การเข้าถึง (Role-Based Access Control - RBAC):**
   - **รปภ. ทั่วไป (Guard Mode):** สามารถเปิดเว็บดูตารางเวรรวม และเลือกรอบเงินเดือนเพื่อดูสรุปวันทำงานของตนเองได้ (Read-Only)
   - **Supervisor และ Site Manager (Admin Mode):** เข้าสู่ระบบด้วย Username / Password (ค่าเริ่มต้น: `admin` / `password` และ `sup_usman` / `password` **ให้เปลี่ยนก่อนใช้งานจริง**) เพื่อเปิดสิทธิ์แก้ไขตารางเวร บันทึกคนลา จัดสแปร์ และพิมพ์เอกสารวางบิล (Supervisor ที่ลงทะเบียนใหม่ต้องรอ Admin อนุมัติ)
4. **โครงสร้างพร้อมขึ้น GitHub และ Firebase:**
   - มีไฟล์ `firebase.json` และ `firestore.rules` พร้อมคำสั่ง `firebase deploy` ทันที (ใช้ Deploy ส่วน Hosting ได้เลย)
5. **ตัดรอบเงินเดือนวันที่ 23 ถึงวันที่ 22 ของเดือนถัดไป (Payday: วันที่ 1):**
   - แถบตารางแสดงวันที่เริ่มต้น 23 ถึง 22 ตรงตามรอบจริงของโรงงาน
   - มีป้ายแจ้งเตือนกำหนดจ่ายเงินเดือนทุกวันที่ 1
6. **หน้าสรุปรายบุคคลของ รปภ. (Personal View):**
   - รปภ. เลือกชื่อตนเอง จะเห็นสรุป:
     - ☀️ จำนวนวันกะเช้า (D) และจำนวนชั่วโมง
     - 🌙 จำนวนวันกะดึก (N) และจำนวนชั่วโมง
     - 🏖️ จำนวนวันหยุดประจำสัปดาห์ (H) ตามเกณฑ์ 5/2
     - 🎉 จำนวนวันหยุดนักขัตฤกษ์ (PH)
     - ผลตรวจความปลอดภัย GDDL (ไม่เกิน 60 ชม./สัปดาห์ นับตามสัปดาห์ปฏิทิน จันทร์-อาทิตย์)

---

## ⚠️ ข้อจำกัดปัจจุบัน (ควรทราบก่อนใช้งานจริง)

- **ข้อมูลทั้งหมดเก็บใน `localStorage` ของเบราว์เซอร์แต่ละเครื่อง** (ตารางที่แก้ไข, บันทึกคนลา, รายชื่อ, บัญชี Supervisor) จึง **ไม่แชร์ข้ามเครื่อง** — สิ่งที่ Supervisor แก้ในเครื่องหนึ่ง รปภ. คนอื่นจะไม่เห็น ยังไม่มีโค้ดเชื่อม Firestore ใน `app.js`
- ระบบล็อกอินเป็นแบบฝั่งเบราว์เซอร์ล้วน ไม่ใช่การรักษาความปลอดภัยจริง (ใครเปิด DevTools ก็แก้ข้อมูลของเครื่องตัวเองได้) ถ้าจะให้ข้อมูลเป็นศูนย์กลางต้องใช้ Firebase Authentication + Firestore แล้วใช้ `firestore.rules` ควบคุมสิทธิ์
- วันนักขัตฤกษ์ที่ตั้งในหน้า Admin แสดงเป็นป้าย PH บนหัวตาราง แต่ไม่เปลี่ยนกะในตารางให้อัตโนมัติ (ต้องคลิกเซลล์เพื่อสลับเป็น PH เอง)

## 🚀 วิธีการทดสอบใช้งานทันที (Offline / Local)

คุณสามารถเปิดใช้งานระบบได้ทันทีบนคอมพิวเตอร์ของคุณ:
1. ไปที่โฟลเดอร์: `C:\Users\sm-continental\.gemini\antigravity\scratch\security_web_portal\public\`
2. ดับเบิ้ลคลิกไฟล์ `index.html` เพื่อเปิดบน Chrome / Edge ได้ทันที!
3. สิทธิ์การใช้งาน:
   - รปภ. ทั่วไป: ใช้งานได้ทันที
   - Supervisor / Admin: กดปุ่ม **"เข้าสู่ระบบ"** มุมขวาบน แล้วใส่ Username / Password

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

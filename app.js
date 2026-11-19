/**
 * Security Work Schedule
 * Production Web Portal Application
 * Complete implementation for Continental Tyres Security Schedule
 */

const { createApp, ref, computed, watch, onMounted } = Vue;

createApp({
  setup() {
    // Current Active Tab
    const currentTab = ref('schedule'); 
    // Tabs: 'schedule' | 'leave_replace' | 'permanent_roster' | 'personal' | 'billing' | 'admin_settings'

    // =========================================================================
    // 4. USER AUTHENTICATION & RBAC (Admin & Supervisor Approval Flow)
    // =========================================================================
    const currentUser = ref(null); // null = General Guard (View only)
    const showLoginModal = ref(false);
    const showRegisterModal = ref(false);
    const loginForm = ref({ username: '', password: '' });
    const registerForm = ref({ username: '', password: '', code: '', name: '', role: 'SUPERVISOR', phone: '' });

    // Seeded Users in LocalStorage
    const defaultUsers = [
      {
        username: 'admin',
        password: 'password', // Default Site Manager password
        name: 'นายอัครเดช เจริญสุข',
        code: 'SE2403575',
        role: 'ADMIN',
        position: 'Site Manager',
        status: 'ACTIVE',
        approvedAt: '2026-01-01'
      },
      {
        username: 'sup_usman',
        password: 'password',
        name: 'นายอุสมาน แลยะลี',
        code: 'SE2400110',
        role: 'SUPERVISOR',
        position: 'Senior Supervisor',
        status: 'ACTIVE',
        approvedAt: '2026-01-01'
      }
    ];

    const userAccounts = ref([]);

    function initUsers() {
      const saved = localStorage.getItem('sws_user_accounts');
      if (saved) {
        userAccounts.value = JSON.parse(saved);
      } else {
        userAccounts.value = defaultUsers;
        saveUsers();
      }

      // Restore session
      const savedSession = localStorage.getItem('sws_active_session');
      if (savedSession) {
        currentUser.value = JSON.parse(savedSession);
      }
    }

    function saveUsers() {
      localStorage.setItem('sws_user_accounts', JSON.stringify(userAccounts.value));
    }

    const isAdmin = computed(() => currentUser.value && currentUser.value.role === 'ADMIN');
    const isSupervisor = computed(() => currentUser.value && (currentUser.value.role === 'SUPERVISOR' || currentUser.value.role === 'ADMIN'));
    const isGuardViewer = computed(() => !currentUser.value);

    function handleLogin() {
      const u = userAccounts.value.find(
        acc => acc.username.toLowerCase() === loginForm.value.username.trim().toLowerCase() && 
               acc.password === loginForm.value.password.trim()
      );

      if (!u) {
        alert('❌ ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        return;
      }

      if (u.status === 'PENDING') {
        alert('⏳ บัญชี Supervisor นี้กำลังรอการอนุมัติจาก Admin (Site Manager)\nกรุณาติดต่อ Site Manager เพื่อเปิดใช้งานระบบ');
        return;
      }

      if (u.status === 'SUSPENDED') {
        alert('🚫 บัญชีนี้ถูกระงับสิทธิ์การใช้งาน กรุณาติดต่อ Site Manager');
        return;
      }

      currentUser.value = u;
      localStorage.setItem('sws_active_session', JSON.stringify(u));
      showLoginModal.value = false;
      loginForm.value = { username: '', password: '' };
      alert(`✅ ยินดีต้อนรับคุณ ${u.name} เข้าสู่ระบบ (${u.role === 'ADMIN' ? 'Site Manager / Admin' : 'Supervisor'})`);
    }

    function handleRegister() {
      if (!registerForm.value.username || !registerForm.value.password || !registerForm.value.code || !registerForm.value.name) {
        alert('⚠️ กรุณากรอกข้อมูลให้ครบทุกช่อง');
        return;
      }

      const exists = userAccounts.value.some(
        acc => acc.username.toLowerCase() === registerForm.value.username.trim().toLowerCase()
      );
      if (exists) {
        alert('❌ ชื่อผู้ใช้นี้มีในระบบแล้ว กรุณาใช้ชื่ออื่น');
        return;
      }

      const newUser = {
        username: registerForm.value.username.trim(),
        password: registerForm.value.password.trim(),
        code: registerForm.value.code.trim(),
        name: registerForm.value.name.trim(),
        role: 'SUPERVISOR',
        position: 'Supervisor',
        phone: registerForm.value.phone.trim(),
        status: 'PENDING', // Requires Admin approval
        registeredAt: new Date().toISOString()
      };

      userAccounts.value.push(newUser);
      saveUsers();
      showRegisterModal.value = false;
      registerForm.value = { username: '', password: '', code: '', name: '', role: 'SUPERVISOR', phone: '' };
      alert('📝 ลงทะเบียน Supervisor สำเร็จเรียบร้อย!\nสถานะปัจจุบัน: "รอการอนุมัติ (Pending)"\nกรุณาแจ้ง Site Manager (Admin) เพื่อทำการอนุมัติบัญชีของคุณ');
    }

    function approveSupervisor(user) {
      user.status = 'ACTIVE';
      user.approvedAt = new Date().toISOString();
      saveUsers();
      alert(`✅ อนุมัติสิทธิ์ Supervisor ให้คุณ ${user.name} สำเร็จ!`);
    }

    function suspendSupervisor(user) {
      user.status = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
      saveUsers();
    }

    function deleteSupervisor(user) {
      if (confirm(`คุณต้องการลบบัญชีของ ${user.name} หรือไม่?`)) {
        userAccounts.value = userAccounts.value.filter(u => u.username !== user.username);
        saveUsers();
      }
    }

    function logout() {
      currentUser.value = null;
      localStorage.removeItem('sws_active_session');
      currentTab.value = 'schedule';
      alert('👋 ออกจากระบบเรียบร้อยแล้ว (กลับสู่โหมด รปภ. ทั่วไป)');
    }

    // =========================================================================
    // 6. WORK HOURS SPECIFICATION BY POSITION
    // =========================================================================
    function getPositionWorkHours(position, shiftType = 'D') {
      if (position.includes('Site manager') || position.includes('Fire Man')) {
        return { text: '08:00 - 20:00 (12 ชม.)', hours: 12, start: '08:00', end: '20:00' };
      }
      if (position.includes('Reception')) {
        return { text: '07:00 - 17:00 (10 ชม.)', hours: 10, start: '07:00', end: '17:00' };
      }
      // Other shift-based roles
      if (shiftType === 'D') {
        return { text: '06:30 - 18:30 (12 ชม.)', hours: 12, start: '06:30', end: '18:30' };
      } else if (shiftType === 'N') {
        return { text: '18:30 - 06:30 (12 ชม.)', hours: 12, start: '18:30', end: '06:30' };
      }
      return { text: 'วันหยุด (H)', hours: 0, start: '-', end: '-' };
    }

    // =========================================================================
    // 7. PUBLIC HOLIDAYS (Admin Managed)
    // =========================================================================
    const defaultHolidays = [
      { date: '2026-12-05', name: 'วันคล้ายวันพระบรมราชสมภพ ร.9 / วันพ่อแห่งชาติ' },
      { date: '2026-12-10', name: 'วันรัฐธรรมนูญ' },
      { date: '2026-12-31', name: 'วันสิ้นปี' },
      { date: '2027-01-01', name: 'วันขึ้นปีใหม่' },
      { date: '2027-01-02', name: 'วันหยุดชดเชยวันขึ้นปีใหม่' }
    ];

    const publicHolidays = ref([]);
    const newHoliday = ref({ date: '', name: '' });

    function initHolidays() {
      const saved = localStorage.getItem('sws_public_holidays');
      if (saved) {
        publicHolidays.value = JSON.parse(saved);
      } else {
        publicHolidays.value = defaultHolidays;
        saveHolidays();
      }
    }

    function saveHolidays() {
      localStorage.setItem('sws_public_holidays', JSON.stringify(publicHolidays.value));
    }

    function addHoliday() {
      if (!newHoliday.value.date || !newHoliday.value.name) {
        alert('⚠️ กรุณาระบุวันที่และชื่อวันนักขัตฤกษ์');
        return;
      }
      publicHolidays.value.push({
        date: newHoliday.value.date,
        name: newHoliday.value.name.trim()
      });
      // Sort chronologically
      publicHolidays.value.sort((a, b) => new Date(a.date) - new Date(b.date));
      saveHolidays();
      newHoliday.value = { date: '', name: '' };
      alert('✅ เพิ่มวันนักขัตฤกษ์เรียบร้อยแล้ว');
    }

    function removeHoliday(index) {
      if (confirm('คุณต้องการลบวันนักขัตฤกษ์นี้หรือไม่?')) {
        publicHolidays.value.splice(index, 1);
        saveHolidays();
      }
    }

    function isPublicHoliday(dateString) {
      return publicHolidays.value.some(h => h.date === dateString);
    }

    function getHolidayName(dateString) {
      const h = publicHolidays.value.find(h => h.date === dateString);
      return h ? h.name : '';
    }

    // =========================================================================
    // 2 & 3. PERMANENT ROSTER MANAGEMENT (39 Positions, Code, Name, Vacancy, Add/Delete)
    // =========================================================================
    const defaultRoster = [
      { no: 1, position: 'Site manager', code: 'SE2403575', name: 'นายอัครเดช เจริญสุข', startDate: '2024-03-01', isVacant: false, workHoursType: '08:00 - 20:00' },
      { no: 2, position: 'Security Fire Man 1', code: 'SE2402366', name: 'น.ส.ปณิตา โอละลึก', startDate: '2024-02-15', isVacant: false, workHoursType: '08:00 - 20:00' },
      { no: 3, position: 'Security Fire Man 2', code: 'SE2601481', name: 'น.ส.พรธิตา ศรีกุลวงษ์', startDate: '2026-01-10', isVacant: false, workHoursType: '08:00 - 20:00' },
      { no: 4, position: 'Security Fire Man 3', code: 'SE2604787', name: 'นายจิรโชติ ธงชัย', startDate: '2026-04-01', isVacant: false, workHoursType: '08:00 - 20:00' },
      { no: 5, position: 'Security Fire Man 4', code: 'SE2303758', name: 'นายสมชาย ทุสุนา', startDate: '2023-03-20', isVacant: false, workHoursType: '08:00 - 20:00' },
      { no: 6, position: 'Senior Supervisor', code: 'SE2400110', name: 'นายอุสมาน แลยะลี', startDate: '2024-01-05', isVacant: false, workHoursType: '06:30 - 18:30' },
      { no: 7, position: 'Supervisor', code: 'SE2303757', name: 'นายอนุสรณ์ ศิริวัฒนกุล', startDate: '2023-03-15', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 8, position: 'Supervisor', code: 'SE2500652', name: 'นายปิยวัฒน์ บุญเฮง', startDate: '2025-01-12', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 9, position: 'Supervisor', code: 'SE2400890', name: 'นายธีรวัฒน์ ศรีนนท์เคน', startDate: '2024-08-01', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 10, position: 'Ass. Supervisor', code: 'SE2400595', name: 'นายจักรพงษ์ ตระกูลดี', startDate: '2024-05-10', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 11, position: 'Ass. Supervisor', code: 'SE2400593', name: 'นายพรชัย ใจตรง', startDate: '2024-05-08', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 12, position: 'Ass. Supervisor', code: 'SE2504781', name: 'นายเสกสรร เสนนอก', startDate: '2025-04-20', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 13, position: 'CCTV', code: 'SE2401588', name: 'นายรัชชานนท์ พรมวงค์', startDate: '2024-01-25', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 14, position: 'CCTV', code: 'SE2501019', name: 'น.ส. สุภาวดี หมายจันทึก', startDate: '2025-01-18', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 15, position: 'CCTV', code: 'SE2501861', name: 'น.ส.นัทธมน เสนานิคม', startDate: '2025-01-20', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 16, position: 'Emergency Driver', code: 'SE2402957', name: 'นายณัฏฐสิทธิ์ มงคลดี', startDate: '2024-02-28', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 17, position: 'Emergency Driver', code: 'SE2303770', name: 'นายอดิสรณ์ ขาวงาม', startDate: '2023-03-25', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 18, position: 'Emergency Driver', code: 'SE2500083', name: 'นายเรืองฤทธิ์ คำผง', startDate: '2025-01-02', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 19, position: 'Admin Day - Gate 1', code: 'SE2303764', name: 'น.ส.วิเชียร แมดพิมาย', startDate: '2023-03-18', isVacant: false, workHoursType: '06:30 - 18:30' },
      { no: 20, position: 'Admin Day - Gate 2', code: 'SE2500239', name: 'น.ส. อรนุช สายปัญญา', startDate: '2025-01-05', isVacant: false, workHoursType: '06:30 - 18:30' },
      { no: 21, position: 'Guard', code: '', name: '', startDate: '', isVacant: true, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' }, // Vacant
      { no: 22, position: 'Guard', code: 'SE172615', name: 'นายประเสริฐ มูลฤทธิ์', startDate: '2017-06-15', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 23, position: 'Guard', code: 'SE2503274', name: 'นายวัลลภ พิรักษา', startDate: '2025-03-10', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 24, position: 'Guard', code: 'SE2504780', name: 'นายจุลชาติ แถลงกัณฑ์', startDate: '2025-04-18', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 25, position: 'Guard', code: 'SE2401151', name: 'นายสินณรงค์กร ทองเกษร', startDate: '2024-01-19', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 26, position: 'Guard', code: 'SE2303133', name: 'นายดำรงพร วงศ์สมบัติ', startDate: '2023-03-05', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 27, position: 'Guard', code: 'SE2602602', name: 'นายสุทธิพงษ์ ปัญญาพรม', startDate: '2026-02-14', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 28, position: 'Guard', code: 'SE2501573', name: 'นายสรยุทธ หอมสมบัติ', startDate: '2025-01-22', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 29, position: 'Guard', code: 'SE2605554', name: 'นายวันชัย ช่วยปัด', startDate: '2026-05-12', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 30, position: 'Guard', code: 'SE2503503', name: 'นายถาวร ไชยโคตร', startDate: '2025-03-15', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 31, position: 'Guard', code: '', name: '', startDate: '', isVacant: true, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' }, // Vacant
      { no: 32, position: 'Guard', code: 'SE2402657', name: 'นายอดิเทพ อุระเพ็ญ', startDate: '2024-02-20', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 33, position: 'Guard', code: 'SE2403015', name: 'นายพรชัย จิตรสม', startDate: '2024-03-05', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 34, position: 'Guard', code: 'SE2500612', name: 'นายสุรศักดิ์  อักษรพิมพ์', startDate: '2025-01-10', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 35, position: 'Guard', code: 'SE2603922', name: 'นายภานุวัฒน์ ใบบัวดง', startDate: '2026-03-22', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 36, position: 'Guard', code: '', name: '', startDate: '', isVacant: true, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' }, // Vacant
      { no: 37, position: 'Guard', code: 'SE2603850', name: 'นายอานนท์ สาริกุล', startDate: '2026-03-20', isVacant: false, workHoursType: '06:30 - 18:30 / 18:30 - 06:30' },
      { no: 38, position: 'Reception Staff', code: 'SE2303772', name: 'น.ส.ปรียมน วสะหลาย', startDate: '2023-03-22', isVacant: false, workHoursType: '07:00 - 17:00' },
      { no: 39, position: 'Reception Staff', code: '', name: '', startDate: '', isVacant: true, workHoursType: '07:00 - 17:00' } // Vacant
    ];

    const permanentStaff = ref([]);
    const editingStaff = ref(null);
    const showStaffModal = ref(false);

    function initPermanentStaff() {
      const saved = localStorage.getItem('sws_permanent_staff');
      if (saved) {
        permanentStaff.value = JSON.parse(saved);
        // ย้ายข้อมูลเก่า: Fireman ที่หยุด อ-พ (No.5) ต้องเป็นลำดับ 4, อีก 3 คนหมุนเวียนเป็น Fireman 1-3
        // No.21 ว่าง (ลบรายชื่อเดิมออกตาม Draft Rev002)
        const s21 = permanentStaff.value.find(x => x.no === 21);
        if (s21 && s21.code === 'SE2500384') {
          s21.code = ''; s21.name = ''; s21.startDate = ''; s21.isVacant = true;
          savePermanentStaff();
        }
        const s4 = permanentStaff.value.find(x => x.no === 4);
        const s5 = permanentStaff.value.find(x => x.no === 5);
        if (s4 && s5 && s4.position === 'Security Fire Man 4' && s5.position === 'Security Fire Man 3') {
          s4.position = 'Security Fire Man 3';
          s5.position = 'Security Fire Man 4';
          savePermanentStaff();
        }
      } else {
        permanentStaff.value = defaultRoster;
        savePermanentStaff();
      }
    }

    function savePermanentStaff() {
      localStorage.setItem('sws_permanent_staff', JSON.stringify(permanentStaff.value));
    }

    function openEditStaff(staff) {
      editingStaff.value = JSON.parse(JSON.stringify(staff));
      showStaffModal.value = true;
    }

    function saveStaffModal() {
      if (!editingStaff.value.code || !editingStaff.value.name) {
        alert('⚠️ กรุณากรอกรหัสพนักงาน และชื่อ-สกุล');
        return;
      }
      const idx = permanentStaff.value.findIndex(s => s.no === editingStaff.value.no);
      if (idx !== -1) {
        permanentStaff.value[idx].code = editingStaff.value.code.trim();
        permanentStaff.value[idx].name = editingStaff.value.name.trim();
        permanentStaff.value[idx].startDate = editingStaff.value.startDate;
        permanentStaff.value[idx].isVacant = false;
        savePermanentStaff();
        syncStaffToSchedule();
        showStaffModal.value = false;
        alert(`✅ บันทึกข้อมูล รปภ.ประจำ No.${editingStaff.value.no} สำเร็จ`);
      }
    }

    function vacateStaff(staff) {
      if (confirm(`⚠️ ยืนยันการปลดออก/ลาออก ของ No.${staff.no} (${staff.name}) หรือไม่?\nเมื่อปลดออก ตำแหน่งนี้จะกลายเป็น "ตำแหน่งว่าง (รอสแปร์)" เพื่อให้ระบบคำนวณยอดขอสแปร์อัตโนมัติ`)) {
        staff.isVacant = true;
        staff.name = '';
        staff.code = '';
        staff.startDate = '';
        savePermanentStaff();
        syncStaffToSchedule();
        alert(`✅ ปรับสถานะ No.${staff.no} เป็นตำแหน่งว่าง (รอสแปร์) เรียบร้อยแล้ว`);
      }
    }

    function syncStaffToSchedule() {
      // Sync names and vacancy to scheduleData
      permanentStaff.value.forEach(p => {
        const row = scheduleData.value.find(s => s.no === p.no);
        if (row) {
          row.code = p.code;
          row.name = p.isVacant ? `[ตำแหน่งว่าง - รอสแปร์]` : p.name;
          row.isSpare = p.isVacant;
        }
      });
      saveSchedule();
    }

    // =========================================================================
    // DATE HELPERS (local-time safe: toISOString() shifts the day by -1 in UTC+7)
    // =========================================================================
    function fmtDate(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    function parseDate(str) {
      const [y, m, d] = str.split('-').map(Number);
      return new Date(y, m - 1, d);
    }

    // =========================================================================
    // 11. PAYROLL CYCLES & SCHEDULE CONTINUITY ENGINE
    // =========================================================================
    // รอบเงินเดือน 23 -> 22 ของเดือนถัดไป สร้างอัตโนมัติ (ตั้งชื่อตามเดือนที่รอบสิ้นสุด, จ่ายวันที่ 1 ของเดือนถัดจากนั้น)
    const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    function buildPayrollCycles(fromYear, fromMonth, count) {
      const list = [];
      for (let i = 0; i < count; i++) {
        const endIdx = fromYear * 12 + (fromMonth - 1) + i;        // เดือนที่รอบสิ้นสุด
        const endYear = Math.floor(endIdx / 12);
        const endMonthNum = (endIdx % 12) + 1;
        const startIdx = endIdx - 1;
        const startYear = Math.floor(startIdx / 12);
        const startMonthNum = (startIdx % 12) + 1;
        const payIdx = endIdx + 1;
        const payYear = Math.floor(payIdx / 12);
        const payMonthNum = (payIdx % 12) + 1;
        list.push({
          id: `${endYear}-${String(endMonthNum).padStart(2, '0')}`,
          name: `รอบ ${THAI_MONTHS[endMonthNum - 1]} ${endYear}`,
          startYear, startMonthNum, startMonth: THAI_MONTHS[startMonthNum - 1],
          endYear, endMonthNum, endMonth: THAI_MONTHS[endMonthNum - 1],
          payDateMonth: `${THAI_MONTHS[payMonthNum - 1]} ${payYear}`
        });
      }
      return list;
    }
    // พ.ย. 2026 ถึง ธ.ค. 2027 (14 รอบ)
    const payrollCycles = ref(buildPayrollCycles(2026, 11, 14));
    // เริ่มต้นที่รอบ ธ.ค. 2026 (23 พ.ย. - 22 ธ.ค.) ซึ่งเป็นรอบของ Draft
    const selectedCycleIndex = ref(Math.max(0, payrollCycles.value.findIndex(c => c.id === '2026-12')));
    const currentCycle = computed(() => payrollCycles.value[selectedCycleIndex.value]);

    const currentCycleDays = computed(() => {
      const cycle = currentCycle.value;
      const days = [];
      const dayNamesTH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

      let cur = new Date(cycle.startYear, cycle.startMonthNum - 1, 23);
      const end = new Date(cycle.endYear, cycle.endMonthNum - 1, 22);

      while (cur <= end) {
        const dateStr = fmtDate(cur);
        days.push({
          date: new Date(cur),
          dateString: dateStr,
          dayNumber: cur.getDate(),
          dayName: dayNamesTH[cur.getDay()],
          isHoliday: isPublicHoliday(dateStr),
          holidayName: getHolidayName(dateStr)
        });
        cur.setDate(cur.getDate() + 1);
      }
      return days;
    });

    // Exact Master December Baseline (Golden Roster)
    const masterBaselineShifts = [
      "D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D", // 1 Site Mgr
      "H,D,D,D,D,H,D,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D", // 2 Fireman 1 (หมุนเวียนรายเดือน)
      "D,D,D,D,H,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D", // 3 Fireman 2 (หมุนเวียนรายเดือน)
      "D,D,D,D,D,H,H,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D", // 4 Fireman 3 (หมุนเวียนรายเดือน)
      "D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H", // 5 Fireman 4 (หยุด อ-พ คงที่)
      "D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D", // 6 Snr Sup
      "D,D,D,H,H,D,N,N,N,N,H,H,D,D,D,D,D,H,H,D,N,N,N,N,H,H,D,D,D,D", // 7 Sup
      "N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H", // 8 Sup
      "H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N", // 9 Sup
      "N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N", // 10 Ass Sup
      "H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H", // 11 Ass Sup
      "D,D,H,H,D,N,N,N,N,H,H,D,D,D,D,D,H,H,D,N,N,N,N,H,H,D,D,D,D,D", // 12 Ass Sup
      "D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D", // 13 CCTV
      "N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N", // 14 CCTV
      "H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H", // 15 CCTV
      "D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D", // 16 Driver
      "N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N", // 17 Driver
      "D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H", // 18 Driver
      "H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D", // 19 Admin Gate 1
      "D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D", // 20 Admin Gate 2
      "D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D", // 21 Guard (ว่าง/สแปร์)
      "N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H", // 22 Guard
      "N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N", // 23 Guard
      "N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N", // 24 Guard
      "N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N", // 25 Guard
      "H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N", // 26 Guard
      "H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H", // 27 Guard
      "D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H", // 28 Guard
      "D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D", // 29 Guard
      "D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D", // 30 Guard
      "H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D", // 31 Guard (Spare)
      "H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H", // 32 Guard
      "D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D", // 33 Guard
      "N,N,N,H,H,D,D,D,N,N,H,H,D,D,N,N,N,H,H,D,D,D,N,N,H,H,D,D,N,N", // 34 Guard
      "D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D", // 35 Guard
      "N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H", // 36 Guard (Spare)
      "H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N", // 37 Guard
      "D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D", // 38 Reception
      "D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D", // 39 Reception (Spare)
      "H,H,D,N,H,H,D,H,H,D,D,H,H,N,H,H,D,N,H,H,D,H,H,D,D,H,H,N,H,H"  // 40 Spare Relief Pool
    ];

    // =========================================================================
    // WEEKDAY-ANCHORED PATTERN ENGINE
    // วันหยุด/ลำดับกะของแต่ละตำแหน่งยึด "วันในสัปดาห์" ไม่ใช่ "วันที่"
    // - Draft เริ่มจันทร์ 23 พ.ย. 2026 (offset 0) ยาว 30 วัน
    // - ทุกตำแหน่งวนซ้ำทุก 14 วัน (D/N สลับสัปดาห์) ใช้ช่วงที่นิ่งแล้วของ Draft (วันที่ 14-27) เป็นแม่แบบ
    // - ยกเว้น Fireman 1-3 ที่หมุนวันหยุดทุกรอบเงินเดือน (ดูด้านล่าง) ส่วน Fireman 4 หยุด อ-พ คงที่
    // =========================================================================
    const PATTERN_ANCHOR_UTC = Date.UTC(2026, 10, 23); // Monday 23 Nov 2026
    const DRAFT_LENGTH = 30;
    const draftRows = masterBaselineShifts.map(r => r.split(','));
    const weeklyCycles = draftRows.map(r => r.slice(14, 28)); // 14-day steady-state cycle

    function dayOffsetFromAnchor(dateObj) {
      const utc = Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
      return Math.round((utc - PATTERN_ANCHOR_UTC) / 86400000);
    }

    // ---- Fireman 1-3: หมุนเวียนทุกรอบเงินเดือน  หยุด ศ-ส (A) -> อา-จ (B) -> ส-อา (C) -> ศ-ส (A) ...
    // ลำดับสัปดาห์ (จันทร์..อาทิตย์)
    const FIREMAN_STEADY = [
      ['D','D','D','D','H','H','D'], // A: หยุด ศ-ส
      ['H','D','D','D','D','D','H'], // B: หยุด อา-จ
      ['D','D','D','D','D','H','H']  // C: หยุด ส-อา
    ];
    // สัปดาห์เปลี่ยนผ่าน (สัปดาห์แรกที่เริ่มสลับ) ตาม Draft ธ.ค. 2026 — index = รูปแบบเดิมก่อนสลับ
    const FIREMAN_TRANSITION = [
      ['D','D','D','D','H','D','H'], // A -> B
      ['H','D','D','D','D','H','D'], // B -> C
      ['D','D','D','D','D','H','H']  // C -> A
    ];
    // รูปแบบของแต่ละแถวในรอบ ธ.ค. 2026 (รอบที่ k = 0): แถว Fireman1 = C, Fireman2 = B, Fireman3 = A
    const FIREMAN_START = { 1: 2, 2: 1, 3: 0 };

    const mod = (n, m) => ((n % m) + m) % m;
    const utcDayNum = (y, m, d) => Math.round(Date.UTC(y, m, d) / 86400000);
    // วันจันทร์แรก (หรือวันเริ่มรอบเอง ถ้าตรงกับวันจันทร์) นับจากวันที่ 23 ของรอบที่ k  (k=0 → 23 พ.ย. 2026)
    function cyclePivot(k) {
      const start = utcDayNum(2026, 10 + k, 23);
      const monIdx = mod(start + 3, 7); // 1970-01-01 = Thu → Mon = 0
      return start + mod(7 - monIdx, 7);
    }

    function getFiremanShift(rowIdx, dateObj) {
      const day = utcDayNum(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
      const weekday = mod(day + 3, 7); // Mon = 0 ... Sun = 6
      let k = (dateObj.getFullYear() * 12 + dateObj.getMonth()) - (2026 * 12 + 10) + 1;
      while (cyclePivot(k) > day) k--;
      const week = Math.floor((day - cyclePivot(k)) / 7);
      const now = mod(FIREMAN_START[rowIdx] + k, 3);
      if (week === 0) return FIREMAN_TRANSITION[mod(now - 1, 3)][weekday];
      return FIREMAN_STEADY[now][weekday];
    }

    function getPatternShift(rowIdx, dateObj) {
      if (FIREMAN_START[rowIdx] !== undefined) return getFiremanShift(rowIdx, dateObj);
      const off = dayOffsetFromAnchor(dateObj);
      if (off >= 0 && off < DRAFT_LENGTH) return draftRows[rowIdx][off];
      return weeklyCycles[rowIdx][mod(off, 14)];
    }

    const scheduleData = ref([]);

    function initSchedule() {
      const cycle = currentCycle.value;
      const storageKey = `sws_schedule_v3_${cycle.id}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        scheduleData.value = JSON.parse(saved);
        return;
      }

      const cycleDays = currentCycleDays.value;

      scheduleData.value = permanentStaff.value.map((staff, idx) => {
        // ลำดับใน permanentStaff ตรงกับแถวใน Draft (No.1 = แถว 1 ... No.39 = แถว 39)
        const shifts = cycleDays.map(d => getPatternShift(idx, d.date));

        return {
          id: staff.no,
          no: staff.no,
          position: staff.position,
          code: staff.code,
          name: staff.isVacant ? `[ตำแหน่งว่าง - รอสแปร์]` : staff.name,
          isSpare: staff.isVacant,
          workHoursType: staff.workHoursType,
          replacementName: null,
          replacementType: null,
          shifts
        };
      });

      // Add Row 40 Relief Pool
      const reliefShifts = currentCycleDays.value.map(d => getPatternShift(39, d.date));
      scheduleData.value.push({
        id: 40,
        no: 40,
        position: 'Spare Relief Pool (โควตาสแปร์หมุนเวียน)',
        code: 'SPARE-RELIEF',
        name: 'รปภ. สแปร์หมุนเวียนตามสัญญา',
        isSpare: true,
        isReliefPool: true,
        workHoursType: '06:30 - 18:30 / 18:30 - 06:30',
        replacementName: null,
        replacementType: null,
        shifts: reliefShifts
      });

      saveSchedule();
    }

    function saveSchedule() {
      const cycle = currentCycle.value;
      const storageKey = `sws_schedule_v3_${cycle.id}`;
      localStorage.setItem(storageKey, JSON.stringify(scheduleData.value));
    }

    function resetScheduleToMaster() {
      if (confirm('⚠️ ต้องการรีเซ็ตตารางเวรของรอบนี้กลับสู่ Master Draft ดั้งเดิมหรือไม่?\n(ข้อมูลการสลับกะที่เคยแก้ไขด้วยมือจะถูกแทนที่)')) {
        const cycle = currentCycle.value;
        localStorage.removeItem(`sws_schedule_v3_${cycle.id}`);
        initSchedule();
        alert('✅ รีเซ็ตตารางเวรกลับสู่ค่าเริ่มต้นเรียบร้อยแล้ว');
      }
    }

    // =========================================================================
    // 1 & 3. LEAVE & REPLACEMENT SYSTEM (With Employee Code & Name for Both)
    // =========================================================================
    const leaveRecords = ref([]);
    const showLeaveModal = ref(false);
    const leaveForm = ref({
      guardNo: 1,
      guardCode: '',
      guardName: '',
      date: fmtDate(new Date()),
      reason: 'ลากิจ / ลาป่วย',
      replaceType: 'สแปร์นอก', // 'คนประจำมาแทน (OT)' | 'สแปร์นอก'
      replacementCode: '',
      replacementName: ''
    });

    function initLeaveRecords() {
      const saved = localStorage.getItem('sws_leave_records');
      if (saved) {
        leaveRecords.value = JSON.parse(saved);
      }
    }

    function saveLeaveRecords() {
      localStorage.setItem('sws_leave_records', JSON.stringify(leaveRecords.value));
    }

    function openLeaveModal(guardNo = null) {
      if (guardNo) {
        const staff = permanentStaff.value.find(s => s.no === guardNo);
        if (staff) {
          leaveForm.value.guardNo = staff.no;
          leaveForm.value.guardCode = staff.code;
          leaveForm.value.guardName = staff.name;
        }
      } else {
        const first = permanentStaff.value[0];
        leaveForm.value.guardNo = first.no;
        leaveForm.value.guardCode = first.code;
        leaveForm.value.guardName = first.name;
      }
      showLeaveModal.value = true;
    }

    function onLeaveGuardChange() {
      const staff = permanentStaff.value.find(s => s.no === leaveForm.value.guardNo);
      if (staff) {
        leaveForm.value.guardCode = staff.code;
        leaveForm.value.guardName = staff.name;
      }
    }

    function submitLeave() {
      if (!leaveForm.value.guardName) {
        alert('⚠️ กรุณาระบุชื่อพนักงานที่ลา');
        return;
      }
      if (!leaveForm.value.replacementName) {
        alert('⚠️ กรุณาระบุรหัสและชื่อ-สกุล ของผู้มาปฏิบัติหน้าที่แทน (ตามข้อ 3)');
        return;
      }

      const dayIdx = currentCycleDays.value.findIndex(d => d.dateString === leaveForm.value.date);
      const row = scheduleData.value.find(s => s.no === leaveForm.value.guardNo);

      if (row && dayIdx !== -1) {
        const prevShift = row.shifts[dayIdx];
        if (prevShift === 'H') {
          alert(`⚠️ วันที่ ${leaveForm.value.date} เป็นวันหยุด (H) ของ ${row.name} อยู่แล้ว`);
          return;
        }

        row.shifts[dayIdx] = 'L'; // Set to Leave
        row.replacementName = `${leaveForm.value.replacementName} (${leaveForm.value.replacementCode || '-'})`;
        row.replacementType = leaveForm.value.replaceType;

        const newRecord = {
          id: Date.now(),
          cycleId: currentCycle.value.id,
          date: leaveForm.value.date,
          shift: prevShift === 'N' ? 'N' : 'D',
          guardNo: row.no,
          guardCode: row.code,
          guardName: row.name,
          position: row.position,
          reason: leaveForm.value.reason,
          replaceType: leaveForm.value.replaceType,
          replacementCode: leaveForm.value.replacementCode.trim(),
          replacementName: leaveForm.value.replacementName.trim(),
          loggedBy: currentUser.value ? currentUser.value.name : 'Supervisor',
          timestamp: new Date().toISOString()
        };

        leaveRecords.value.unshift(newRecord);
        saveLeaveRecords();
        saveSchedule();
        showLeaveModal.value = false;
        alert(`✅ บันทึกคนลา & จัดคนแทนสำเร็จ!\nผู้ลา: ${row.name}\nผู้แทน: ${leaveForm.value.replacementName} [${leaveForm.value.replaceType}]`);
      }
    }

    function cancelLeave(record) {
      if (confirm(`คุณต้องการยกเลิกการลาของ ${record.guardName} วันที่ ${record.date} หรือไม่?`)) {
        leaveRecords.value = leaveRecords.value.filter(r => r.id !== record.id);
        saveLeaveRecords();
        // Restore shift in schedule
        const dayIdx = currentCycleDays.value.findIndex(d => d.dateString === record.date);
        const row = scheduleData.value.find(s => s.no === record.guardNo);
        if (row && dayIdx !== -1) {
          row.shifts[dayIdx] = record.shift;
          row.replacementName = null;
          row.replacementType = null;
          saveSchedule();
        }
        alert('✅ ยกเลิกรายการลาเรียบร้อยแล้ว');
      }
    }

    // =========================================================================
    // 8 & 9. BILLING SUMMARY & EXPORT (Admin Only & 4 Signature Blocks)
    // =========================================================================
    const billingStartDate = ref('2026-11-23');
    const billingEndDate = ref('2026-12-22');

    const billingDays = computed(() => {
      const days = [];
      let cur = parseDate(billingStartDate.value);
      const end = parseDate(billingEndDate.value);
      const dayNamesTH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

      while (cur <= end) {
        const dateStr = fmtDate(cur);
        days.push({
          date: new Date(cur),
          dateString: dateStr,
          dayNumber: cur.getDate(),
          dayName: dayNamesTH[cur.getDay()]
        });
        cur.setDate(cur.getDate() + 1);
      }
      return days;
    });

    const billingGuardSummaries = computed(() => {
      return scheduleData.value.map(guard => {
        let dayShifts = 0;
        let nightShifts = 0;
        let offDays = 0;
        let phDays = 0;
        let totalHours = 0;

        billingDays.value.forEach(bDay => {
          const sDayIdx = currentCycleDays.value.findIndex(d => d.dateString === bDay.dateString);
          if (sDayIdx !== -1) {
            const shift = guard.shifts[sDayIdx];
            if (shift === 'D') {
              dayShifts++;
              totalHours += getPositionWorkHours(guard.position, 'D').hours;
            } else if (shift === 'N') {
              nightShifts++;
              totalHours += getPositionWorkHours(guard.position, 'N').hours;
            } else if (shift === 'H') {
              offDays++;
            } else if (shift === 'PH') {
              phDays++;
              totalHours += getPositionWorkHours(guard.position, 'D').hours;
            }
          }
        });

        return {
          no: guard.no,
          position: guard.position,
          code: guard.code,
          name: guard.name,
          isSpare: guard.isSpare,
          isReliefPool: guard.isReliefPool,
          dayShifts,
          nightShifts,
          offDays,
          phDays,
          totalWorkDays: dayShifts + nightShifts + phDays,
          totalHours
        };
      });
    });

    const billingSpareDispatches = computed(() => {
      return leaveRecords.value.filter(r => r.date >= billingStartDate.value && r.date <= billingEndDate.value);
    });

    function printBilling() {
      window.print();
    }

    // =========================================================================
    // DAILY CONTRACT CALCULATIONS
    // =========================================================================
    function getDailyContract(dateObj, shiftType) {
      if (shiftType === 'N') return 10;
      const day = dateObj.getDay();
      if (day === 0) return 16; // Sun
      if (day === 6) return 17; // Sat
      return 19; // Mon-Fri
    }

    function getDailyActual(dayIdx, shiftType) {
      if (!scheduleData.value.length) return 0;
      return scheduleData.value.reduce((acc, guard) => {
        return acc + (guard.shifts[dayIdx] === shiftType ? 1 : 0);
      }, 0);
    }

    function getDailySpareGap(dayIdx, dateObj, shiftType) {
      const contract = getDailyContract(dateObj, shiftType);
      const actual = getDailyActual(dayIdx, shiftType);
      return Math.max(0, contract - actual);
    }

    // Shift Editing by Admin / Sup
    function editShift(guard, sIdx) {
      if (!isAdmin.value && !isSupervisor.value) return;
      const current = guard.shifts[sIdx];
      const choices = ['D', 'N', 'H', 'PH', 'L'];
      const nextIdx = (choices.indexOf(current) + 1) % choices.length;
      guard.shifts[sIdx] = choices[nextIdx];
      saveSchedule();
    }

    function countShifts(guard, shiftChar) {
      if (!guard || !guard.shifts) return 0;
      return guard.shifts.filter(s => s === shiftChar).length;
    }

    function checkGDDL(guard) {
      if (!guard) return true;
      const totalWork = countShifts(guard, 'D') + countShifts(guard, 'N') + countShifts(guard, 'PH');
      return totalWork <= 22;
    }

    function isWeekend(dateObj) {
      const d = dateObj.getDay();
      return d === 0 || d === 6;
    }

    function getShiftStyle(shift) {
      switch (shift) {
        case 'D': return 'bg-amber-100/90 text-amber-950 border-amber-300';
        case 'N': return 'bg-indigo-100/90 text-indigo-950 border-indigo-300';
        case 'H': return 'bg-slate-200/80 text-slate-500 border-slate-300';
        case 'L': return 'bg-red-200 text-red-950 border-red-300';
        case 'PH': return 'bg-purple-200 text-purple-950 border-purple-300';
        default: return 'bg-white text-slate-700';
      }
    }

    // Guard Individual Tab state
    const selectedGuardNo = ref(1);
    const selectedGuard = computed(() => {
      return scheduleData.value.find(g => g.no === selectedGuardNo.value) || scheduleData.value[0];
    });

    const guardWorkHoursText = computed(() => {
      if (!selectedGuard.value) return '';
      return getPositionWorkHours(selectedGuard.value.position, 'D').text;
    });

    function selectTab(tab) {
      if (tab === 'billing' && !isAdmin.value) {
        alert('🔒 หัวข้อ "วางบิล (Billing Summary)" สงวนสิทธิ์เฉพาะ Admin (Site Manager) เท่านั้น ตามข้อกำหนดข้อ 7');
        return;
      }
      currentTab.value = tab;
    }

    onMounted(() => {
      initUsers();
      initHolidays();
      initPermanentStaff();
      initLeaveRecords();
      initSchedule();
    });

    watch(selectedCycleIndex, () => {
      initSchedule();
    });

    return {
      currentTab,
      selectTab,
      currentUser,
      isAdmin,
      isSupervisor,
      isGuardViewer,
      showLoginModal,
      showRegisterModal,
      loginForm,
      registerForm,
      handleLogin,
      handleRegister,
      logout,
      userAccounts,
      approveSupervisor,
      suspendSupervisor,
      deleteSupervisor,
      permanentStaff,
      editingStaff,
      showStaffModal,
      openEditStaff,
      saveStaffModal,
      vacateStaff,
      publicHolidays,
      newHoliday,
      addHoliday,
      removeHoliday,
      isPublicHoliday,
      getHolidayName,
      payrollCycles,
      selectedCycleIndex,
      currentCycle,
      currentCycleDays,
      scheduleData,
      isWeekend,
      getShiftStyle,
      editShift,
      countShifts,
      checkGDDL,
      getDailyContract,
      getDailyActual,
      getDailySpareGap,
      resetScheduleToMaster,
      leaveRecords,
      showLeaveModal,
      leaveForm,
      openLeaveModal,
      onLeaveGuardChange,
      submitLeave,
      cancelLeave,
      billingStartDate,
      billingEndDate,
      billingDays,
      billingGuardSummaries,
      billingSpareDispatches,
      printBilling,
      getPositionWorkHours,
      selectedGuardNo,
      selectedGuard,
      guardWorkHoursText
    };
  }
}).mount('#app');

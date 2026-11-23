/**
 * Security Work Schedule
 * Production Web Portal Application
 * Complete implementation for Continental Tyres Security Schedule
 */

const { createApp, ref, computed, watch, onMounted } = Vue;

// อ่าน localStorage แบบปลอดภัย: ถ้าข้อมูลเสีย/อ่านไม่ได้ ให้ใช้ค่า fallback แทนที่จะทำให้ทั้งเว็บล่ม
function safeParse(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn('ข้อมูลใน localStorage เสียหาย (' + key + ') ใช้ค่าเริ่มต้นแทน', e);
    return fallback;
  }
}

// มาตรฐาน GDDL 5/2: ชั่วโมงทำงานรวมไม่เกิน 60 ชม. ต่อสัปดาห์ (จันทร์-อาทิตย์)
const GDDL_MAX_WEEK_HOURS = 60;

// รหัส PIN ก่อนเข้าดูตาราง (หน้าล็อกฝั่งเบราว์เซอร์ เปลี่ยนรหัสได้ที่นี่)
const ACCESS_PIN = '5353';
const PIN_REMEMBER_DAYS = 30; // ถ้าติ๊ก "จำเครื่องนี้" จะไม่ต้องใส่ซ้ำกี่วัน
const PIN_MAX_FAILS = 5;      // ใส่ผิดเกินนี้จะถูกหน่วงเวลา
const PIN_LOCK_SECONDS = 30;

// =========================================================================
// FIREBASE (ระบบกลาง) — เปิดใช้เมื่อโหลด Firebase SDK + firebase-config.js สำเร็จ
// ถ้าไม่มี/โหลดไม่ได้ ระบบจะกลับไปทำงานแบบเดิม คือเก็บใน localStorage ของเครื่องนั้น
// =========================================================================
const FB_WINDOW = typeof window !== 'undefined' ? window : {};
let CLOUD_ENABLED = !!(FB_WINDOW.firebase && FB_WINDOW.FIREBASE_CONFIG && FB_WINDOW.FIREBASE_CONFIG.apiKey);
let fbAuth = null;
let fbDb = null;
if (CLOUD_ENABLED) {
  try {
    FB_WINDOW.firebase.initializeApp(FB_WINDOW.FIREBASE_CONFIG);
    fbAuth = FB_WINDOW.firebase.auth();
    fbDb = FB_WINDOW.firebase.firestore();
  } catch (e) {
    console.error('เริ่มต้น Firebase ไม่สำเร็จ ใช้โหมดเครื่องนี้แทน', e);
    CLOUD_ENABLED = false;
  }
}
// Firebase Auth ต้องใช้อีเมล: แปลง username -> username@sws.local (ไม่ใช่อีเมลจริง)
const EMAIL_DOMAIN = 'sws.local';
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
const usernameToEmail = u => `${String(u).trim().toLowerCase()}@${EMAIL_DOMAIN}`;
// แปลงเป็น object ธรรมดา (ตัด Vue proxy / undefined) ก่อนส่งเข้า Firestore
const plain = x => JSON.parse(JSON.stringify(x));

createApp({
  setup() {
    // Current Active Tab
    const currentTab = ref('schedule'); 
    // Tabs: 'schedule' | 'leave_replace' | 'permanent_roster' | 'personal' | 'billing' | 'admin_settings'

    // =========================================================================
    // 0. PIN GATE (หน้าใส่รหัสก่อนเข้าดูตาราง)
    // =========================================================================
    const pinUnlocked = ref((() => {
      const ok = safeParse('sws_pin_ok', null);
      return !!(ok && ok.until > Date.now());
    })());
    const pinInput = ref('');
    const pinError = ref('');
    const pinRemember = ref(true);
    let pinFails = 0;
    let pinLockedUntil = 0;

    function submitPin() {
      const now = Date.now();
      if (now < pinLockedUntil) {
        pinError.value = `ใส่รหัสผิดหลายครั้ง กรุณารออีก ${Math.ceil((pinLockedUntil - now) / 1000)} วินาที`;
        return;
      }
      if (pinInput.value.trim() === ACCESS_PIN) {
        pinFails = 0;
        pinError.value = '';
        pinInput.value = '';
        pinUnlocked.value = true;
        if (pinRemember.value) {
          localStorage.setItem('sws_pin_ok', JSON.stringify({ until: now + PIN_REMEMBER_DAYS * 86400000 }));
        }
        return;
      }
      pinInput.value = '';
      pinFails++;
      if (pinFails >= PIN_MAX_FAILS) {
        pinFails = 0;
        pinLockedUntil = now + PIN_LOCK_SECONDS * 1000;
        pinError.value = `ใส่รหัสผิดหลายครั้ง กรุณารอ ${PIN_LOCK_SECONDS} วินาที`;
      } else {
        pinError.value = '❌ รหัส PIN ไม่ถูกต้อง';
      }
    }

    function lockApp() {
      localStorage.removeItem('sws_pin_ok');
      pinUnlocked.value = false;
      pinInput.value = '';
      pinError.value = '';
      currentTab.value = 'schedule';
    }

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
    const cloudStatus = ref(CLOUD_ENABLED ? 'connecting' : 'local'); // local | connecting | online | error
    const authReady = ref(!CLOUD_ENABLED);
    let suppressAuthEvents = false;
    let unsubUsers = null;

    function initUsers() {
      if (CLOUD_ENABLED) {
        // โหมดระบบกลาง: ไม่มีบัญชี/รหัสผ่านฝังในโค้ด ล็อกอินผ่าน Firebase Authentication
        userAccounts.value = [];
        fbAuth.onAuthStateChanged(async fbUser => {
          if (suppressAuthEvents) return;
          if (fbUser) {
            await establishSession(fbUser, false);
          } else {
            currentUser.value = null;
            refreshUsersSubscription();
          }
          authReady.value = true;
        });
        return;
      }

      const saved = safeParse('sws_user_accounts', null);
      if (Array.isArray(saved) && saved.length) {
        userAccounts.value = saved;
      } else {
        userAccounts.value = defaultUsers;
        saveUsers();
      }

      // Restore session: เก็บเฉพาะ username (ไม่เก็บรหัสผ่านไว้ใน session) แล้วค้นหาบัญชีล่าสุดทุกครั้ง
      // บัญชีที่ถูกระงับ/ลบ จะไม่ถูกกู้สิทธิ์กลับมา (รองรับ session แบบเก่าที่เก็บเป็น object ด้วย)
      const rawSession = safeParse('sws_active_session', null);
      const sessionUsername = typeof rawSession === 'string' ? rawSession : (rawSession && rawSession.username);
      if (sessionUsername) {
        const u = userAccounts.value.find(a => a.username === sessionUsername && a.status === 'ACTIVE');
        if (u) {
          currentUser.value = u;
        } else {
          localStorage.removeItem('sws_active_session');
        }
      }
    }

    function saveUsers() {
      localStorage.setItem('sws_user_accounts', JSON.stringify(userAccounts.value));
    }

    const isAdmin = computed(() => currentUser.value && currentUser.value.role === 'ADMIN');
    const isSupervisor = computed(() => currentUser.value && (currentUser.value.role === 'SUPERVISOR' || currentUser.value.role === 'ADMIN'));
    const isGuardViewer = computed(() => !currentUser.value);

    // Admin เท่านั้นที่ฟังรายชื่อบัญชีทั้งหมดได้ (Rules บังคับอีกชั้น)
    function refreshUsersSubscription() {
      if (!CLOUD_ENABLED) return;
      if (unsubUsers) { unsubUsers(); unsubUsers = null; }
      if (isAdmin.value) {
        unsubUsers = fbDb.collection('users').onSnapshot(snap => {
          userAccounts.value = snap.docs
            .map(d => ({ uid: d.id, ...d.data() }))
            .sort((x, y) => String(x.username).localeCompare(String(y.username)));
        }, err => console.warn('อ่านรายชื่อบัญชีไม่ได้', err));
      } else {
        userAccounts.value = [];
      }
    }

    // ตรวจสิทธิ์จากเอกสาร users/{uid} ใน Firestore แล้วตั้ง currentUser (ใช้ทั้งตอนล็อกอินและตอนเปิดเว็บซ้ำ)
    async function establishSession(fbUser, interactive) {
      let profile = null;
      try {
        const snap = await fbDb.collection('users').doc(fbUser.uid).get();
        profile = snap.exists ? { uid: fbUser.uid, ...snap.data() } : null;
      } catch (e) {
        console.warn('อ่านข้อมูลสิทธิ์ไม่ได้', e);
      }
      let problem = null;
      if (!profile) problem = '❌ บัญชีนี้ยังไม่มีข้อมูลสิทธิ์ในระบบ กรุณาติดต่อ Site Manager';
      else if (profile.status === 'PENDING') problem = '⏳ บัญชี Supervisor นี้กำลังรอการอนุมัติจาก Admin (Site Manager)\nกรุณาติดต่อ Site Manager เพื่อเปิดใช้งานระบบ';
      else if (profile.status !== 'ACTIVE') problem = '🚫 บัญชีนี้ถูกระงับสิทธิ์การใช้งาน กรุณาติดต่อ Site Manager';

      if (problem) {
        try { await fbAuth.signOut(); } catch (e) { /* ignore */ }
        currentUser.value = null;
        refreshUsersSubscription();
        if (interactive) alert(problem);
        return false;
      }
      currentUser.value = profile;
      refreshUsersSubscription();
      return true;
    }

    function handleLogin() {
      return CLOUD_ENABLED ? handleLoginCloud() : handleLoginLocal();
    }

    async function handleLoginCloud() {
      const username = loginForm.value.username.trim().toLowerCase();
      const password = loginForm.value.password;
      if (!username || !password) {
        alert('⚠️ กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
        return;
      }
      suppressAuthEvents = true;
      try {
        const cred = await fbAuth.signInWithEmailAndPassword(usernameToEmail(username), password);
        const ok = await establishSession(cred.user, true);
        if (ok) {
          showLoginModal.value = false;
          loginForm.value = { username: '', password: '' };
          alert(`✅ ยินดีต้อนรับคุณ ${currentUser.value.name} เข้าสู่ระบบ (${currentUser.value.role === 'ADMIN' ? 'Site Manager / Admin' : 'Supervisor'})`);
        }
      } catch (e) {
        const code = e && e.code;
        if (code === 'auth/too-many-requests') alert('🚫 ลองผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่');
        else if (code === 'auth/network-request-failed') alert('📡 เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาลองใหม่');
        else alert('❌ ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
      } finally {
        suppressAuthEvents = false;
        authReady.value = true;
      }
    }

    function handleLoginLocal() {
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
      localStorage.setItem('sws_active_session', JSON.stringify(u.username));
      showLoginModal.value = false;
      loginForm.value = { username: '', password: '' };
      alert(`✅ ยินดีต้อนรับคุณ ${u.name} เข้าสู่ระบบ (${u.role === 'ADMIN' ? 'Site Manager / Admin' : 'Supervisor'})`);
    }

    function handleRegister() {
      return CLOUD_ENABLED ? handleRegisterCloud() : handleRegisterLocal();
    }

    async function handleRegisterCloud() {
      const f = registerForm.value;
      const username = f.username.trim().toLowerCase();
      if (!username || !f.password || !f.code.trim() || !f.name.trim()) {
        alert('⚠️ กรุณากรอกข้อมูลให้ครบทุกช่อง');
        return;
      }
      if (!USERNAME_RE.test(username)) {
        alert('⚠️ ชื่อผู้ใช้ต้องเป็นตัวอักษรภาษาอังกฤษพิมพ์เล็ก ตัวเลข จุด ขีดกลาง หรือขีดล่าง ความยาว 3-30 ตัว (เช่น sup_somchai)');
        return;
      }
      if (f.password.length < 6) {
        alert('⚠️ รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร');
        return;
      }
      suppressAuthEvents = true;
      try {
        const cred = await fbAuth.createUserWithEmailAndPassword(usernameToEmail(username), f.password);
        await fbDb.collection('users').doc(cred.user.uid).set({
          username,
          name: f.name.trim(),
          code: f.code.trim(),
          role: 'SUPERVISOR',
          position: 'Supervisor',
          phone: (f.phone || '').trim(),
          status: 'PENDING', // ต้องให้ Admin อนุมัติ
          registeredAt: new Date().toISOString()
        });
        await fbAuth.signOut();
        showRegisterModal.value = false;
        registerForm.value = { username: '', password: '', code: '', name: '', role: 'SUPERVISOR', phone: '' };
        alert('📝 ลงทะเบียน Supervisor สำเร็จเรียบร้อย!\nสถานะปัจจุบัน: "รอการอนุมัติ (Pending)"\nกรุณาแจ้ง Site Manager (Admin) เพื่อทำการอนุมัติบัญชีของคุณ');
      } catch (e) {
        const code = e && e.code;
        if (code === 'auth/email-already-in-use') alert('❌ ชื่อผู้ใช้นี้มีในระบบแล้ว กรุณาใช้ชื่ออื่น');
        else if (code === 'auth/weak-password') alert('⚠️ รหัสผ่านง่ายเกินไป (ต้องยาวอย่างน้อย 6 ตัวอักษร)');
        else if (code === 'auth/network-request-failed') alert('📡 เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาลองใหม่');
        else alert('⚠️ ลงทะเบียนไม่สำเร็จ กรุณาแจ้ง Site Manager\n(' + ((e && (e.code || e.message)) || 'unknown') + ')');
        try { await fbAuth.signOut(); } catch (e2) { /* ignore */ }
      } finally {
        suppressAuthEvents = false;
      }
    }

    function handleRegisterLocal() {
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
      if (CLOUD_ENABLED) {
        fbDb.collection('users').doc(user.uid).update({ status: 'ACTIVE', approvedAt: new Date().toISOString() })
          .then(() => alert(`✅ อนุมัติสิทธิ์ Supervisor ให้คุณ ${user.name} สำเร็จ!`))
          .catch(cloudWriteError);
        return;
      }
      user.status = 'ACTIVE';
      user.approvedAt = new Date().toISOString();
      saveUsers();
      alert(`✅ อนุมัติสิทธิ์ Supervisor ให้คุณ ${user.name} สำเร็จ!`);
    }

    function suspendSupervisor(user) {
      const next = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
      if (CLOUD_ENABLED) {
        fbDb.collection('users').doc(user.uid).update({ status: next }).catch(cloudWriteError);
        return;
      }
      user.status = next;
      saveUsers();
    }

    function deleteSupervisor(user) {
      if (!confirm(`คุณต้องการลบบัญชีของ ${user.name} หรือไม่?`)) return;
      if (CLOUD_ENABLED) {
        // ลบเฉพาะข้อมูลสิทธิ์ (users/{uid}) ทำให้ล็อกอินไม่ได้ ส่วนบัญชีใน Authentication ลบได้ที่ Firebase Console
        fbDb.collection('users').doc(user.uid).delete()
          .then(() => alert('✅ ลบสิทธิ์ผู้ใช้แล้ว (ถ้าต้องการลบบัญชีล็อกอินจริง ให้ลบใน Firebase Console → Authentication)'))
          .catch(cloudWriteError);
        return;
      }
      userAccounts.value = userAccounts.value.filter(u => u.username !== user.username);
      saveUsers();
    }

    function logout() {
      if (CLOUD_ENABLED) {
        fbAuth.signOut().catch(e => console.warn('signOut ไม่สำเร็จ', e));
      }
      currentUser.value = null;
      localStorage.removeItem('sws_active_session');
      currentTab.value = 'schedule';
      refreshUsersSubscription();
      alert('👋 ออกจากระบบเรียบร้อยแล้ว (กลับสู่โหมด รปภ. ทั่วไป)');
    }

    // =========================================================================
    // เปลี่ยนรหัสผ่าน (Change Password)
    // =========================================================================
    const showChangePasswordModal = ref(false);
    const changePasswordForm = ref({ oldPassword: '', newPassword: '', confirmPassword: '' });
    const changePasswordError = ref('');
    const changePasswordLoading = ref(false);

    function openChangePasswordModal() {
      changePasswordForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' };
      changePasswordError.value = '';
      showChangePasswordModal.value = true;
    }

    async function handleChangePassword() {
      const f = changePasswordForm.value;
      changePasswordError.value = '';

      // ตรวจสอบข้อมูลเบื้องต้น
      if (!f.newPassword || !f.confirmPassword) {
        changePasswordError.value = '⚠️ กรุณากรอกรหัสผ่านใหม่และยืนยันรหัสผ่าน';
        return;
      }
      if (f.newPassword.length < 6) {
        changePasswordError.value = '⚠️ รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร';
        return;
      }
      if (f.newPassword !== f.confirmPassword) {
        changePasswordError.value = '❌ รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน';
        return;
      }

      changePasswordLoading.value = true;

      // โหมด Firebase
      if (CLOUD_ENABLED) {
        try {
          const user = fbAuth.currentUser;
          if (!user) {
            changePasswordError.value = '❌ ไม่พบข้อมูลผู้ใช้ กรุณาล็อกอินใหม่';
            changePasswordLoading.value = false;
            return;
          }
          // Re-authenticate ก่อนเปลี่ยนรหัสผ่าน (Firebase กำหนด)
          if (!f.oldPassword) {
            changePasswordError.value = '⚠️ กรุณาใส่รหัสผ่านเดิม (จำเป็นเพื่อยืนยันตัวตน)';
            changePasswordLoading.value = false;
            return;
          }
          const credential = FB_WINDOW.firebase.auth.EmailAuthProvider.credential(user.email, f.oldPassword);
          await user.reauthenticateWithCredential(credential);
          await user.updatePassword(f.newPassword);
          showChangePasswordModal.value = false;
          alert('✅ เปลี่ยนรหัสผ่านสำเร็จแล้ว กรุณาใช้รหัสผ่านใหม่ในการล็อกอินครั้งต่อไป');
        } catch (e) {
          const code = e && e.code;
          if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
            changePasswordError.value = '❌ รหัสผ่านเดิมไม่ถูกต้อง';
          } else if (code === 'auth/too-many-requests') {
            changePasswordError.value = '🚫 ลองผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่';
          } else if (code === 'auth/network-request-failed') {
            changePasswordError.value = '📡 เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาลองใหม่';
          } else {
            changePasswordError.value = '⚠️ เปลี่ยนรหัสผ่านไม่สำเร็จ: ' + ((e && (e.message || e.code)) || 'unknown');
          }
        } finally {
          changePasswordLoading.value = false;
        }
        return;
      }

      // โหมด localStorage
      const u = userAccounts.value.find(a => a.username === currentUser.value.username);
      if (!u) {
        changePasswordError.value = '❌ ไม่พบข้อมูลบัญชี';
        changePasswordLoading.value = false;
        return;
      }
      if (f.oldPassword !== u.password) {
        changePasswordError.value = '❌ รหัสผ่านเดิมไม่ถูกต้อง';
        changePasswordLoading.value = false;
        return;
      }
      u.password = f.newPassword;
      currentUser.value = u;
      saveUsers();
      changePasswordLoading.value = false;
      showChangePasswordModal.value = false;
      alert('✅ เปลี่ยนรหัสผ่านสำเร็จแล้ว กรุณาใช้รหัสผ่านใหม่ในการล็อกอินครั้งต่อไป');
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

    // ชั่วโมงทำงานของกะหนึ่งๆ (D / PH นับเป็นกะเช้า, N = กะดึก, H / L = 0)
    function shiftHours(position, shift) {
      if (shift === 'D' || shift === 'PH') return getPositionWorkHours(position, 'D').hours;
      if (shift === 'N') return getPositionWorkHours(position, 'N').hours;
      return 0;
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
      if (CLOUD_ENABLED) {
        publicHolidays.value = plain(defaultHolidays);
        return;
      }
      const saved = safeParse('sws_public_holidays', null);
      if (Array.isArray(saved)) {
        publicHolidays.value = saved;
      } else {
        publicHolidays.value = defaultHolidays;
        saveHolidays();
      }
    }

    function saveHolidays() {
      if (CLOUD_ENABLED) {
        cloudWrite(fbDb.collection('settings').doc('holidays').set({ list: plain(publicHolidays.value) }));
        return;
      }
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
      if (CLOUD_ENABLED) {
        // เริ่มจากค่าเริ่มต้นก่อน แล้วระบบกลางจะส่งข้อมูลล่าสุดมาทับ (ดู startCloudListeners)
        permanentStaff.value = plain(defaultRoster);
        return;
      }
      const saved = safeParse('sws_permanent_staff', null);
      if (Array.isArray(saved) && saved.length) {
        permanentStaff.value = saved;
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
      if (CLOUD_ENABLED) {
        cloudWrite(fbDb.collection('roster').doc('main').set({ staff: plain(permanentStaff.value) }));
        return;
      }
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

    // ซิงก์ ตำแหน่ง/รหัส/ชื่อ/สถานะว่าง จากทะเบียน รปภ.ประจำ ลงในแถวตารางเวร
    function syncRowsWithRoster(rows) {
      permanentStaff.value.forEach(p => {
        const row = rows.find(s => s.no === p.no);
        if (row) {
          row.position = p.position;
          row.code = p.code;
          row.name = p.isVacant ? `[ตำแหน่งว่าง - รอสแปร์]` : p.name;
          row.isSpare = p.isVacant;
        }
      });
    }

    function syncStaffToSchedule() {
      syncRowsWithRoster(scheduleData.value);
      // โหมดระบบกลาง: ชื่อ/ตำแหน่งอ้างอิงจากทะเบียน (roster) ทุกครั้งที่โหลด จึงไม่ต้องเขียนตารางซ้ำ
      if (!CLOUD_ENABLED) saveSchedule();
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

    // วันทั้งหมดของรอบเงินเดือนหนึ่งๆ (23 -> 22)
    function getCycleDays(cycle) {
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
    }

    const currentCycleDays = computed(() => getCycleDays(currentCycle.value));

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

    // สร้างแถวตารางเวรของรอบหนึ่งจากแพทเทิร์น Master (ไม่บันทึกลง localStorage)
    function buildCycleRows(cycle) {
      const cycleDays = getCycleDays(cycle);

      const rows = permanentStaff.value.map((staff, idx) => {
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
      rows.push({
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
        shifts: cycleDays.map(d => getPatternShift(39, d.date))
      });

      return rows;
    }

    function initSchedule() {
      const cycle = currentCycle.value;
      if (CLOUD_ENABLED) {
        // แสดงค่าจากแพทเทิร์นทันที แล้วนำแถวที่ถูกแก้ไขในระบบกลางมาทับแบบเรียลไทม์
        scheduleData.value = buildCycleRows(cycle);
        subscribeCycleRows(cycle);
        return;
      }
      const saved = safeParse(`sws_schedule_v3_${cycle.id}`, null);
      if (Array.isArray(saved) && saved.length) {
        // รอบที่เคยบันทึกไว้: ซิงก์ชื่อ/ตำแหน่งให้ตรงกับทะเบียนล่าสุด (เผื่อแก้รายชื่อตอนอยู่รอบอื่น)
        syncRowsWithRoster(saved);
        scheduleData.value = saved;
        return;
      }
      scheduleData.value = buildCycleRows(cycle);
      saveSchedule();
    }

    function saveSchedule(onlyRow) {
      if (CLOUD_ENABLED) {
        cloudSaveRows(currentCycle.value.id, onlyRow ? [onlyRow] : scheduleData.value);
        return;
      }
      const cycle = currentCycle.value;
      const storageKey = `sws_schedule_v3_${cycle.id}`;
      localStorage.setItem(storageKey, JSON.stringify(scheduleData.value));
    }

    async function resetScheduleToMaster() {
      if (!isAdmin.value) {
        alert('🔒 ปุ่มรีเซ็ต Master ใช้ได้เฉพาะ Admin (Site Manager) เท่านั้น');
        return;
      }
      if (!confirm('⚠️ ต้องการรีเซ็ตตารางเวรของรอบนี้กลับสู่ Master Draft ดั้งเดิมหรือไม่?\n(ข้อมูลการสลับกะที่เคยแก้ไขด้วยมือจะถูกแทนที่)')) return;
      const cycle = currentCycle.value;
      if (CLOUD_ENABLED) {
        try {
          const snap = await fbDb.collection('schedules').doc(cycle.id).collection('rows').get();
          await commitOps(snap.docs.map(d => batch => batch.delete(d.ref)));
          initSchedule();
          alert('✅ รีเซ็ตตารางเวรกลับสู่ค่าเริ่มต้นเรียบร้อยแล้ว');
        } catch (e) {
          cloudWriteError(e);
        }
        return;
      }
      localStorage.removeItem(`sws_schedule_v3_${cycle.id}`);
      initSchedule();
      alert('✅ รีเซ็ตตารางเวรกลับสู่ค่าเริ่มต้นเรียบร้อยแล้ว');
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
      reason: 'ลากิจ / ลาป่วย'
    });

    function initLeaveRecords() {
      if (CLOUD_ENABLED) {
        leaveRecords.value = [];
        return;
      }
      const saved = safeParse('sws_leave_records', []);
      leaveRecords.value = Array.isArray(saved) ? saved : [];
    }

    function saveLeaveRecords() {
      localStorage.setItem('sws_leave_records', JSON.stringify(leaveRecords.value));
    }

    function persistLeaveAdd(record) {
      if (CLOUD_ENABLED) {
        cloudWrite(fbDb.collection('leaveRecords').doc(String(record.id)).set(plain(record)));
      } else {
        saveLeaveRecords();
      }
    }

    function persistLeaveRemove(record) {
      if (CLOUD_ENABLED) {
        cloudWrite(fbDb.collection('leaveRecords').doc(String(record.id)).delete());
      } else {
        saveLeaveRecords();
      }
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
        const first = permanentStaff.value.find(s => !s.isVacant) || permanentStaff.value[0];
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

    // สร้างข้อความ "แทน: ..." ใต้ชื่อในตาราง จากรายการลาจริงของคนนั้นในรอบนั้น
    // (เดิมเก็บเป็นค่าเดียวต่อแถว ทำให้ลาหลายวันแล้วชื่อคนแทนทับกัน/ยกเลิกวันหนึ่งแล้วหายหมด)
    function refreshReplacementLabel(row, cycleId) {
      const recs = leaveRecords.value
        .filter(r => r.cycleId === cycleId && r.guardNo === row.no && r.replacementName)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (!recs.length) {
        row.replacementName = null;
        row.replacementType = null;
        return;
      }
      row.replacementName = recs
        .map(r => `${r.replacementName} (${r.replacementCode || '-'}) [${r.date.slice(8)}]`)
        .join(', ');
      row.replacementType = recs[recs.length - 1].replaceType;
    }

    // แจ้งคนลา: บันทึกว่าคนประจำคนไหนลาวันไหน -> ระบบนับเป็นยอดที่ต้องขอสแปร์
    // ผูกกับรอบเงินเดือนตาม "วันที่ลา" โดยอัตโนมัติ ไม่ว่าหน้าจอกำลังดูรอบไหนอยู่
    async function submitLeave() {
      const f = leaveForm.value;
      if (!f.guardName) {
        alert('⚠️ กรุณาระบุชื่อพนักงานที่ลา');
        return;
      }
      if (!f.date) {
        alert('⚠️ กรุณาระบุวันที่ลา');
        return;
      }
      const dateObj = parseDate(f.date);
      const cycleId = cycleIdForDate(dateObj);
      const cycle = payrollCycles.value.find(c => c.id === cycleId);
      if (!cycle) {
        const list = payrollCycles.value;
        alert(`⚠️ วันที่ ${f.date} อยู่นอกช่วงรอบเงินเดือนที่ระบบรองรับ (${list[0].name} ถึง ${list[list.length - 1].name})`);
        return;
      }
      const dayIdx = utcDayNum(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate())
        - utcDayNum(cycle.startYear, cycle.startMonthNum - 1, 23);
      const isCurrent = cycleId === currentCycle.value.id;

      // หาแถวของคนลาในรอบที่วันที่นั้นสังกัดอยู่
      let row = null;
      let allRows = null;
      let cloudRef = null;
      try {
        if (isCurrent) {
          row = scheduleData.value.find(r => r.no === f.guardNo);
        } else if (CLOUD_ENABLED) {
          cloudRef = fbDb.collection('schedules').doc(cycleId).collection('rows').doc(String(f.guardNo));
          const snap = await cloudRef.get();
          row = snap.exists ? snap.data() : (buildCycleRows(cycle).find(r => r.no === f.guardNo) || null);
        } else {
          const saved = safeParse(`sws_schedule_v3_${cycleId}`, null);
          allRows = Array.isArray(saved) && saved.length ? saved : buildCycleRows(cycle);
          row = allRows.find(r => r.no === f.guardNo);
        }
      } catch (e) {
        cloudWriteError(e);
        return;
      }
      if (!row || !Array.isArray(row.shifts) || dayIdx < 0 || dayIdx >= row.shifts.length) {
        alert('⚠️ ไม่พบตำแหน่ง/วันที่ที่เลือกในตารางเวร');
        return;
      }

      const prevShift = row.shifts[dayIdx];
      if (prevShift === 'H') {
        alert(`⚠️ วันที่ ${f.date} เป็นวันหยุด (H) ของ ${f.guardName} อยู่แล้ว`);
        return;
      }
      if (prevShift === 'L') {
        alert(`⚠️ วันที่ ${f.date} มีบันทึกลาของ ${f.guardName} อยู่แล้ว`);
        return;
      }

      row.shifts[dayIdx] = 'L'; // Set to Leave
      const shift = prevShift === 'N' ? 'N' : 'D';
      const staff = permanentStaff.value.find(s => s.no === f.guardNo);

      const newRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, // ไม่ซ้ำแม้บันทึกพร้อมกันในมิลลิวินาทีเดียว
        cycleId,
        date: f.date,
        shift,
        originalShift: prevShift, // เก็บกะเดิมไว้คืนค่าเมื่อยกเลิก (เช่น PH)
        guardNo: f.guardNo,
        guardCode: f.guardCode,
        guardName: f.guardName,
        position: staff ? staff.position : row.position,
        reason: f.reason,
        loggedBy: currentUser.value ? currentUser.value.name : 'Supervisor',
        timestamp: new Date().toISOString()
      };

      leaveRecords.value.unshift(newRecord);
      persistLeaveAdd(newRecord);
      if (isCurrent) {
        saveSchedule(row);
      } else if (CLOUD_ENABLED) {
        cloudWrite(cloudRef.set(plain(row)));
      } else {
        localStorage.setItem(`sws_schedule_v3_${cycleId}`, JSON.stringify(allRows));
      }
      showLeaveModal.value = false;
      alert(`✅ บันทึกคนลาสำเร็จ\nผู้ลา: ${f.guardName}\nวันที่ ${newRecord.date} กะ${shift === 'N' ? 'ดึก' : 'เช้า'} (${cycle.name})\nระบบนับเป็นยอดที่ต้องขอสแปร์ 1 อัตรา`);
    }

    function cancelLeave(record) {
      if (!confirm(`คุณต้องการยกเลิกการลาของ ${record.guardName} วันที่ ${record.date} หรือไม่?`)) return;

      leaveRecords.value = leaveRecords.value.filter(r => r.id !== record.id);
      persistLeaveRemove(record);
      const restoreShift = record.originalShift || record.shift;

      if (record.cycleId === currentCycle.value.id) {
        // รอบที่เปิดอยู่: คืนกะในตารางที่แสดงอยู่
        const dayIdx = currentCycleDays.value.findIndex(d => d.dateString === record.date);
        const row = scheduleData.value.find(s => s.no === record.guardNo);
        if (row && dayIdx !== -1) {
          row.shifts[dayIdx] = restoreShift;
          refreshReplacementLabel(row, record.cycleId);
          saveSchedule(row);
        }
      } else {
        // รายการลาของรอบอื่น: แก้ในตารางที่บันทึกไว้ของรอบนั้นโดยตรง
        const cycle = payrollCycles.value.find(c => c.id === record.cycleId);
        if (cycle) {
          const patch = row => {
            const idx = getCycleDays(cycle).findIndex(d => d.dateString === record.date);
            if (idx === -1) return false;
            row.shifts[idx] = restoreShift;
            refreshReplacementLabel(row, record.cycleId);
            return true;
          };
          if (CLOUD_ENABLED) {
            cloudPatchRow(record.cycleId, record.guardNo, patch);
          } else {
            const key = `sws_schedule_v3_${record.cycleId}`;
            const rows = safeParse(key, null);
            if (Array.isArray(rows)) {
              const row = rows.find(r => r.no === record.guardNo);
              if (row && patch(row)) localStorage.setItem(key, JSON.stringify(rows));
            }
          }
        }
      }
      alert('✅ ยกเลิกรายการลาเรียบร้อยแล้ว');
    }

    // =========================================================================
    // SPARE REQUESTS & ARRIVALS (ขอสแปร์ / สแปร์ที่มาปฏิบัติงาน)
    //   ยอดขอสแปร์ของแต่ละกะ = ตำแหน่งว่าง (รอสแปร์) ที่มีกะทำงานวันนั้น + คนประจำที่แจ้งลา
    //   คนประจำที่ไม่ได้ลา = ไม่ต้องขอสแปร์ / สแปร์ที่มาจริงบันทึกแยกเป็นรายกะ (ไม่ผูกกับคนลาคนใด)
    //   พอกะสิ้นสุด ถ้าสแปร์มาไม่ครบ = จุดขาด
    // =========================================================================
    const SPARE_TYPE = 'สแปร์ บ.ต้นสังกัด'; // สแปร์มีประเภทเดียว (แทนเฉพาะกะนั้นของวันนั้น) / คนประจำคนใหม่ให้บรรจุในทะเบียน รปภ.ประจำ

    // =========================================================================
    // สแปร์ประจำ (รายชื่อที่มาบ่อยๆ เพื่อเลือกกรอกฟอร์มได้เลย)
    // =========================================================================
    const regularSpares = ref([]);
    const showRegularSpareMgr = ref(false);
    const regularSpareForm = ref({ code: '', name: '' });

    function initRegularSpares() {
      if (CLOUD_ENABLED) {
        // ระบบกลาง: โหลดจาก Firestore ผ่าน startCloudListeners (listener เพิ่มด้านล่าง)
        regularSpares.value = [];
        return;
      }
      const saved = safeParse('sws_regular_spares', []);
      regularSpares.value = Array.isArray(saved) ? saved : [];
    }

    function saveRegularSpares() {
      if (CLOUD_ENABLED) {
        cloudWrite(fbDb.collection('settings').doc('regular_spares').set({ list: plain(regularSpares.value) }));
        return;
      }
      localStorage.setItem('sws_regular_spares', JSON.stringify(regularSpares.value));
    }

    function addRegularSpare() {
      const code = regularSpareForm.value.code.trim();
      const name = regularSpareForm.value.name.trim();
      if (!name) { alert('⚠️ กรุณากรอกชื่อ-สกุลสแปร์ประจำ'); return; }
      if (regularSpares.value.some(s => s.name === name)) {
        alert('⚠️ มีชื่อนี้ในรายการสแปร์ประจำอยู่แล้ว');
        return;
      }
      regularSpares.value.push({ code, name });
      regularSpareForm.value = { code: '', name: '' };
      saveRegularSpares();
    }

    function removeRegularSpare(idx) {
      if (confirm(`ลบสแปร์ประจำ "${regularSpares.value[idx].name}" หรือไม่?`)) {
        regularSpares.value.splice(idx, 1);
        saveRegularSpares();
      }
    }

    function pickRegularSpare(sp) {
      spareForm.value.code = sp.code;
      spareForm.value.name = sp.name;
      showRegularSpareMgr.value = false;
    }

    // =========================================================================
    // Admin แก้ไขรายการสแปร์ที่บันทึกไว้แล้ว (แก้ชื่อ/รหัสย้อนหลังกรณีพิมพ์ผิด)
    // =========================================================================
    const editingSpareId = ref(null);
    const spareEditForm = ref({ code: '', name: '' });

    function startEditSpare(sp) {
      editingSpareId.value = sp.id;
      spareEditForm.value = { code: sp.code || '', name: sp.name || '' };
    }

    function cancelEditSpare() {
      editingSpareId.value = null;
      spareEditForm.value = { code: '', name: '' };
    }

    function saveEditSpare() {
      const name = spareEditForm.value.name.trim();
      if (!name) { alert('⚠️ กรุณากรอกชื่อ-สกุลสแปร์'); return; }
      const idx = spareArrivals.value.findIndex(s => s.id === editingSpareId.value);
      if (idx !== -1) {
        spareArrivals.value[idx].code = spareEditForm.value.code.trim();
        spareArrivals.value[idx].name = name;
        spareArrivals.value[idx].editedAt = new Date().toISOString();
        spareArrivals.value[idx].editedBy = currentUser.value ? currentUser.value.name : 'admin';
        persistSpareAdd(spareArrivals.value[idx]);
      }
      cancelEditSpare();
      alert('✅ แก้ไขข้อมูลสแปร์เรียบร้อยแล้ว');
    }
    const SHIFT_END = { D: { h: 18, m: 30, nextDay: false }, N: { h: 6, m: 30, nextDay: true } }; // เช้าจบ 18:30 / ดึกจบ 06:30 วันถัดไป
    const nowTick = ref(Date.now());
    const spareArrivals = ref([]);
    const showSpareModal = ref(false);
    const spareForm = ref({ date: fmtDate(new Date()), shift: 'D', type: SPARE_TYPE, positionNo: '', code: '', name: '', note: '' });
    const activeStaff = computed(() => permanentStaff.value.filter(s => !s.isVacant));

    function initSpareArrivals() {
      if (CLOUD_ENABLED) {
        spareArrivals.value = [];
        return;
      }
      const saved = safeParse('sws_spare_arrivals', []);
      spareArrivals.value = Array.isArray(saved) ? saved : [];
    }

    function saveSpareArrivals() {
      localStorage.setItem('sws_spare_arrivals', JSON.stringify(spareArrivals.value));
    }

    function persistSpareAdd(rec) {
      if (CLOUD_ENABLED) {
        cloudWrite(fbDb.collection('spareArrivals').doc(String(rec.id)).set(plain(rec)));
      } else {
        saveSpareArrivals();
      }
    }

    function persistSpareRemove(rec) {
      if (CLOUD_ENABLED) {
        cloudWrite(fbDb.collection('spareArrivals').doc(String(rec.id)).delete());
      } else {
        saveSpareArrivals();
      }
    }

    function sortSpareArrivals() {
      spareArrivals.value.sort((a, b) =>
        String(b.date).localeCompare(String(a.date)) || String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    }

    // เปิดหน้าต่างบันทึกสแปร์ (กำหนดวันที่/กะ/จุดที่เข้าแทน ล่วงหน้าได้ เช่น กดจากรายการจุดขาด)
    function openSpareModal(date, shift, positionNo) {
      spareForm.value = { date: date || fmtDate(new Date()), shift: shift || 'D', type: SPARE_TYPE, positionNo: positionNo || '', code: '', name: '', note: '' };
      showSpareModal.value = true;
    }

    function submitSpare() {
      const f = spareForm.value;
      const name = (f.name || '').trim();
      if (!name) {
        alert('⚠️ กรุณาระบุชื่อ-สกุล ของสแปร์ที่มาปฏิบัติงาน');
        return;
      }
      if (!f.date) {
        alert('⚠️ กรุณาระบุวันที่');
        return;
      }
      if (f.shift !== 'D' && f.shift !== 'N') {
        alert('⚠️ กรุณาเลือกกะ (เช้า/ดึก)');
        return;
      }
      const posNo = Number(f.positionNo);
      if (!posNo) {
        alert('⚠️ กรุณาเลือกจุดที่สแปร์เข้าแทน');
        return;
      }
      const posRow = scheduleData.value.find(r => r.no === posNo);
      if (!posRow) {
        alert('⚠️ ไม่พบตำแหน่งที่เลือก');
        return;
      }
      const dup = spareArrivals.value.some(a => a.date === f.date && a.shift === f.shift && String(a.name).trim().toLowerCase() === name.toLowerCase());
      if (dup) {
        alert('⚠️ มีชื่อนี้บันทึกไว้ในกะนี้แล้ว');
        return;
      }
      const taken = spareArrivals.value.find(a => a.date === f.date && a.shift === f.shift && Number(a.positionNo) === posNo);
      if (taken) {
        alert(`⚠️ จุดนี้ในกะนี้มีสแปร์ ${taken.name} เข้าแทนอยู่แล้ว`);
        return;
      }
      const rec = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        date: f.date,
        shift: f.shift,
        type: SPARE_TYPE,
        positionNo: posNo,
        positionText: spotText(posRow),
        positionName: posRow.position,
        positionPerson: posRow.isReliefPool ? 'โควตาสแปร์' : (posRow.isSpare ? 'ตำแหน่งว่าง' : posRow.name),
        code: (f.code || '').trim(),
        name,
        note: (f.note || '').trim(),
        loggedBy: currentUser.value ? currentUser.value.name : 'Supervisor',
        timestamp: new Date().toISOString()
      };
      spareArrivals.value.unshift(rec);
      sortSpareArrivals();
      persistSpareAdd(rec);
      showSpareModal.value = false;
      alert(`✅ บันทึกสแปร์ที่มาปฏิบัติงานแล้ว\n${name} · ${rec.date} กะ${rec.shift === 'N' ? 'ดึก' : 'เช้า'}\nแทนจุด: ${rec.positionText}`);
    }

    function cancelSpare(rec) {
      if (!confirm(`ลบรายการสแปร์ ${rec.name} วันที่ ${rec.date} กะ${rec.shift === 'N' ? 'ดึก' : 'เช้า'} หรือไม่?`)) return;
      spareArrivals.value = spareArrivals.value.filter(a => a.id !== rec.id);
      persistSpareRemove(rec);
    }

    // สแปร์ที่มาจริง แยกตาม วันที่|กะ
    const arrivalsIndex = computed(() => {
      const m = {};
      spareArrivals.value.forEach(a => {
        const k = `${a.date}|${a.shift}`;
        (m[k] = m[k] || []).push(a);
      });
      return m;
    });

    // กะเดิมของคนลา (D/N) ดูจากบันทึกลา ถ้าไม่มีบันทึก (เช่น คลิกเซลล์เป็น L เอง) ใช้กะตามแพทเทิร์น
    const leaveShiftIndex = computed(() => {
      const m = {};
      leaveRecords.value.forEach(r => {
        m[`${r.guardNo}|${r.date}`] = (r.originalShift === 'N' || r.shift === 'N') ? 'N' : 'D';
      });
      return m;
    });

    function leaveShiftOf(row, date, dateString) {
      const hit = leaveShiftIndex.value[`${row.no}|${dateString}`];
      if (hit) return hit;
      const idx = row.no <= 39 ? row.no - 1 : 39;
      return getPatternShift(idx, date) === 'N' ? 'N' : 'D';
    }

    function shiftEndMs(dateString, type) {
      const [y, m, d] = dateString.split('-').map(Number);
      const e = SHIFT_END[type];
      return new Date(y, m - 1, d + (e.nextDay ? 1 : 0), e.h, e.m).getTime();
    }

    // none = ไม่ต้องขอ, ok = ทุกจุดมีสแปร์แล้ว, pending = กะยังไม่จบ/ยังรอ, short = กะจบแล้วแต่ยังมีจุดไม่มีสแปร์ (จุดขาด)
    function spareStatus(requested, missing, dateString, type) {
      if (requested === 0) return 'none';
      if (missing === 0) return 'ok';
      return nowTick.value >= shiftEndMs(dateString, type) ? 'short' : 'pending';
    }

    // ข้อความบอกจุด เช่น "No.7 นายอนุสรณ์ ศิริวัฒนกุล (Supervisor)" / "No.21 Guard (ตำแหน่งว่าง)"
    function spotText(row) {
      if (row.isReliefPool) return `No.${row.no} Spare Relief Pool (โควตาสแปร์)`;
      if (row.isSpare) return `No.${row.no} ${row.position} (ตำแหน่งว่าง)`;
      return `No.${row.no} ${row.name} (${row.position})`;
    }

    // สรุปยอดขอสแปร์ของวันหนึ่งๆ (rows = ตารางเวรของรอบที่วันนั้นสังกัด, dayIdx = ลำดับวันในรอบ)
    //   จุดที่ต้องขอสแปร์ = ตำแหน่งว่าง + แถว 40 (โควตาสแปร์) ที่มีกะทำงาน + คนประจำที่แจ้งลา
    //   จุดที่มีสแปร์เข้าแทนแล้ว = ดูจาก "จุดที่เข้าแทน" ที่บันทึกไว้ / สแปร์เดิมที่ไม่ได้ระบุจุด นับลดยอดค้างทีละจุด
    function spareStatsFor(rows, dayIdx, date, dateString) {
      const spots = { D: [], N: [] };
      rows.forEach(r => {
        const s = r.shifts[dayIdx];
        if (r.isSpare) {
          const t = s === 'N' ? 'N' : (s === 'D' || s === 'PH') ? 'D' : null;
          if (t) spots[t].push({ no: r.no, kind: r.isReliefPool ? 'pool' : 'vacant', text: spotText(r) });
          return;
        }
        if (s === 'L') spots[leaveShiftOf(r, date, dateString)].push({ no: r.no, kind: 'leave', text: spotText(r) });
      });
      const out = {};
      ['D', 'N'].forEach(t => {
        const arrs = arrivalsIndex.value[`${dateString}|${t}`] || [];
        const hasPos = a => a.positionNo !== undefined && a.positionNo !== null && a.positionNo !== '';
        const coveredNos = new Set(arrs.filter(hasPos).map(a => Number(a.positionNo)));
        const unassigned = arrs.filter(a => !hasPos(a)).length;
        let uncovered = spots[t].filter(sp => !coveredNos.has(sp.no));
        uncovered = uncovered.slice(Math.min(unassigned, uncovered.length));
        const requested = spots[t].length;
        out[t] = {
          vacant: spots[t].filter(sp => sp.kind !== 'leave').length,
          leave: spots[t].filter(sp => sp.kind === 'leave').length,
          requested,
          arrived: arrs.length,
          spots: spots[t],
          uncovered,
          missing: uncovered.length,
          status: spareStatus(requested, uncovered.length, dateString, t)
        };
      });
      return out;
    }

    function spareStatusText(o) {
      if (!o || o.status === 'none') return '-';
      if (o.status === 'ok') return '✓ ครบ';
      if (o.status === 'short') return `⚠️ ขาด ${o.missing}`;
      return `⏳ รอ ${o.missing}`;
    }

    function spareStatusClass(o) {
      if (!o || o.status === 'none') return 'text-slate-300';
      if (o.status === 'ok') return 'bg-emerald-100 text-emerald-800 font-semibold';
      if (o.status === 'short') return 'bg-red-100 text-red-800 font-bold';
      return 'bg-amber-100 text-amber-800 font-semibold';
    }

    // ตัวเลือก "เข้าแทนจุดไหน" ของฟอร์มบันทึกสแปร์: จุดที่ยังไม่มีสแปร์ในวัน/กะที่เลือกขึ้นก่อน ตามด้วยตำแหน่งอื่นๆ
    const spareSpotOptions = computed(() => {
      const f = spareForm.value;
      const d = f.date ? parseDate(f.date) : null;
      const ctx = d && !isNaN(d.getTime()) ? getCycleContext(cycleIdForDate(d)) : null;
      const rows = ctx ? ctx.rows : scheduleData.value;
      let needed = [];
      if (ctx) {
        const idx = utcDayNum(d.getFullYear(), d.getMonth(), d.getDate()) - ctx.startDayNum;
        needed = spareStatsFor(rows, idx, d, f.date)[f.shift === 'N' ? 'N' : 'D'].uncovered.map(sp => ({ no: sp.no, text: sp.text }));
      }
      const nos = new Set(needed.map(x => x.no));
      const others = rows.filter(r => !nos.has(r.no)).map(r => ({ no: r.no, text: spotText(r) }));
      return { needed, others };
    });

    // สรุปทุกวันในรอบที่เปิดอยู่ (ใช้ในหน้าสรุปการขอสแปร์)
    const spareDayStats = computed(() =>
      currentCycleDays.value.map((day, i) => spareStatsFor(scheduleData.value, i, day.date, day.dateString)));

    const spareTotals = computed(() => {
      const t = { reqD: 0, reqN: 0, arrD: 0, arrN: 0, shortShifts: 0, shortPeople: 0, pendingShifts: 0, pendingPeople: 0 };
      spareDayStats.value.forEach(st => {
        ['D', 'N'].forEach(k => {
          const o = st[k];
          t['req' + k] += o.requested;
          t['arr' + k] += o.arrived;
          if (o.status === 'short') { t.shortShifts++; t.shortPeople += o.missing; }
          if (o.status === 'pending') { t.pendingShifts++; t.pendingPeople += o.missing; }
        });
      });
      return t;
    });

    // รายการจุดขาด (กะที่จบแล้วสแปร์ไม่ครบ) และกะที่ยังรอสแปร์
    const spareShortagePoints = computed(() => {
      const pts = [];
      currentCycleDays.value.forEach((day, i) => {
        const st = spareDayStats.value[i];
        ['D', 'N'].forEach(k => {
          const o = st[k];
          if (o.status === 'short' || o.status === 'pending') {
            pts.push({ dateString: day.dateString, dayName: day.dayName, shift: k, requested: o.requested, arrived: o.arrived, missing: o.missing, status: o.status, uncovered: o.uncovered });
          }
        });
      });
      return pts;
    });

    // วันที่เลือกดูในแท็บตารางเวรและแท็บสรุปการขอสแปร์ (เพื่อให้ไฮไลต์คอลัมน์/แถวได้ชัดเจน)
    const selectedDateStr = ref(null);
    function toggleSelectDate(dateStr) {
      selectedDateStr.value = selectedDateStr.value === dateStr ? null : dateStr;
    }
    // เข้ากันได้กับชื่อเดิม (selectedSpareDate)
    const selectedSpareDate = selectedDateStr;
    function selectSpareDate(dateStr) {
      toggleSelectDate(dateStr);
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

    // รอบเงินเดือนที่วันที่หนึ่งๆ สังกัดอยู่ (วันที่ 23 เป็นต้นไป = รอบที่สิ้นสุดเดือนถัดไป)
    function cycleIdForDate(d) {
      let y = d.getFullYear();
      let m = d.getMonth();
      if (d.getDate() >= 23) {
        m += 1;
        if (m > 11) { m = 0; y += 1; }
      }
      return `${y}-${String(m + 1).padStart(2, '0')}`;
    }

    // ตารางเวรของรอบใดก็ได้ (รอบที่เปิดอยู่ใช้ข้อมูลสด, รอบอื่นอ่านจากที่บันทึกไว้ ถ้าไม่มีให้คำนวณจากแพทเทิร์น)
    function getCycleContext(cycleId) {
      const cycle = payrollCycles.value.find(c => c.id === cycleId);
      if (!cycle) return null;
      const startDayNum = utcDayNum(cycle.startYear, cycle.startMonthNum - 1, 23);
      if (cycleId === currentCycle.value.id) return { rows: scheduleData.value, startDayNum };
      if (CLOUD_ENABLED) {
        // รอบอื่น: ใช้ข้อมูลที่โหลดจากระบบกลางไว้แล้ว (ดู loadBillingCycles) ถ้ายังไม่โหลดใช้ค่าจากแพทเทิร์นไปก่อน
        const cached = cloudCycleCache.value[cycleId];
        return { rows: cached || buildCycleRows(cycle), startDayNum };
      }
      const saved = safeParse(`sws_schedule_v3_${cycleId}`, null);
      if (Array.isArray(saved) && saved.length) {
        syncRowsWithRoster(saved);
        return { rows: saved, startDayNum };
      }
      return { rows: buildCycleRows(cycle), startDayNum };
    }

    const billingGuardSummaries = computed(() => {
      const ctxCache = {};
      const ctxFor = id => (id in ctxCache ? ctxCache[id] : (ctxCache[id] = getCycleContext(id)));

      return scheduleData.value.map(guard => {
        let dayShifts = 0;
        let nightShifts = 0;
        let offDays = 0;
        let phDays = 0;
        let totalHours = 0;

        billingDays.value.forEach(bDay => {
          // ใช้ตารางของรอบที่วันนั้นสังกัดอยู่ ไม่ผูกกับรอบที่เลือกบนหน้าจอ (ช่วงวางบิลข้ามรอบได้)
          const ctx = ctxFor(cycleIdForDate(bDay.date));
          if (!ctx) return;
          const row = ctx.rows.find(r => r.no === guard.no);
          if (!row) return;
          const idx = utcDayNum(bDay.date.getFullYear(), bDay.date.getMonth(), bDay.date.getDate()) - ctx.startDayNum;
          const shift = row.shifts[idx];

          if (shift === 'D') dayShifts++;
          else if (shift === 'N') nightShifts++;
          else if (shift === 'H') offDays++;
          else if (shift === 'PH') phDays++;
          totalHours += shiftHours(guard.position, shift);
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
      const inRange = d => d >= billingStartDate.value && d <= billingEndDate.value;
      // สแปร์ที่มาปฏิบัติงานจริง (ไม่ผูกกับตำแหน่ง เพราะ บ.ต้นสังกัดเป็นผู้จัด)
      const arrivals = spareArrivals.value.filter(r => inRange(r.date)).map(r => ({
        id: r.id, date: r.date, shift: r.shift, replaceType: r.type,
        replacementCode: r.code, replacementName: r.name,
        position: r.positionName || 'ไม่ระบุ', guardName: r.positionPerson || 'บ.ต้นสังกัดจัด', loggedBy: r.loggedBy
      }));
      // ข้อมูลเก่าที่เคยบันทึกชื่อคนแทนไว้กับรายการลา
      const legacy = leaveRecords.value.filter(r => r.replacementName && inRange(r.date));
      return [...legacy, ...arrivals].sort((a, b) =>
        String(a.date).localeCompare(String(b.date)) || String(a.shift).localeCompare(String(b.shift)));
    });

    function printBilling() {
      window.print();
    }

    // =========================================================================
    // หน้า "ตารางเวรรวม (พิมพ์/Export)": เลือกช่วงวันที่ได้ พิมพ์/ส่งออกได้ มีช่องลายเซ็น (ข้ามรอบเงินเดือนได้)
    // =========================================================================
    const schedStartDate = ref('2026-11-23');
    const schedEndDate = ref('2026-12-22');
    const SCHED_MAX_DAYS = 62;

    const schedRange = computed(() => {
      const days = [];
      let truncated = false;
      const dayNamesTH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
      let cur = parseDate(schedStartDate.value);
      const end = parseDate(schedEndDate.value);
      while (cur <= end) {
        if (days.length >= SCHED_MAX_DAYS) { truncated = true; break; }
        const dateStr = fmtDate(cur);
        days.push({
          date: new Date(cur),
          dateString: dateStr,
          dayNumber: cur.getDate(),
          monthNumber: cur.getMonth() + 1,
          dayName: dayNamesTH[cur.getDay()],
          isHoliday: isPublicHoliday(dateStr)
        });
        cur.setDate(cur.getDate() + 1);
      }
      return { days, truncated };
    });
    const schedRangeDays = computed(() => schedRange.value.days);
    const schedRangeTruncated = computed(() => schedRange.value.truncated);

    const schedPrint = computed(() => {
      const days = schedRangeDays.value;
      const ctxCache = {};
      const ctxFor = id => {
        if (!(id in ctxCache)) {
          const c = getCycleContext(id);
          ctxCache[id] = c ? { ...c, byNo: Object.fromEntries(c.rows.map(r => [r.no, r])) } : null;
        }
        return ctxCache[id];
      };
      const cells = days.map(day => {
        const ctx = ctxFor(cycleIdForDate(day.date));
        if (!ctx) return null;
        const idx = utcDayNum(day.date.getFullYear(), day.date.getMonth(), day.date.getDate()) - ctx.startDayNum;
        return { ctx, idx };
      });

      const rows = scheduleData.value.map(g => {
        const shifts = cells.map(c => {
          if (!c) return '-';
          const r = c.ctx.byNo[g.no];
          return (r && r.shifts[c.idx]) || '-';
        });
        const cnt = ch => shifts.filter(x => x === ch).length;
        const d = cnt('D'), n = cnt('N'), ph = cnt('PH');
        return {
          no: g.no, position: g.position, code: g.code, name: g.name, isSpare: g.isSpare, isReliefPool: g.isReliefPool,
          shifts, d, n, ph, h: cnt('H'), l: cnt('L'), workDays: d + n + ph
        };
      });

      const stats = days.map((day, i) => {
        const c = cells[i];
        return c ? spareStatsFor(c.ctx.rows, c.idx, day.date, day.dateString) : null;
      });
      return { days, rows, stats };
    });

    const schedLeaveInRange = computed(() => leaveRecords.value
      .filter(r => r.date >= schedStartDate.value && r.date <= schedEndDate.value)
      .slice().sort((a, b) => String(a.date).localeCompare(String(b.date))));
    const schedSpareInRange = computed(() => spareArrivals.value
      .filter(r => r.date >= schedStartDate.value && r.date <= schedEndDate.value)
      .slice().sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.shift).localeCompare(String(b.shift))));

    function printSchedule() {
      if (!isAdmin.value) return;
      window.print();
    }

    function csvCell(v) {
      const t = v === null || v === undefined ? '' : String(v);
      return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    }

    // สร้างไฟล์ CSV (เปิดใน Excel ได้ ภาษาไทยไม่เพี้ยนเพราะใส่ BOM ตอนดาวน์โหลด)
    function buildScheduleCsv() {
      const { days, rows, stats } = schedPrint.value;
      const lines = [];
      lines.push([`ตารางเวรรวม ${schedStartDate.value} ถึง ${schedEndDate.value}`]);
      lines.push(['No.', 'ตำแหน่ง', 'รหัส', 'ชื่อ-สกุล', ...days.map(d => `${d.dayNumber}/${d.monthNumber} ${d.dayName}`), 'D', 'N', 'PH', 'หยุด (H)', 'ลา (L)', 'รวมวันทำงาน']);
      rows.forEach(r => lines.push([r.no, r.position, r.code || '-', r.name, ...r.shifts, r.d, r.n, r.ph, r.h, r.l, r.workDays]));
      lines.push([]);
      [['D', 'กะเช้า'], ['N', 'กะดึก']].forEach(([k, label]) => {
        lines.push(['', '', '', `${label}: ขอสแปร์`, ...stats.map(s => (s ? s[k].requested : ''))]);
        lines.push(['', '', '', `${label}: สแปร์ที่มา`, ...stats.map(s => (s ? s[k].arrived : ''))]);
        lines.push(['', '', '', `${label}: สถานะ`, ...stats.map(s => (s && s[k].status !== 'none' ? spareStatusText(s[k]).replace(/[✓⚠️⏳]/g, '').trim() : ''))]);
      });
      lines.push([]);
      lines.push(['รายการแจ้งลา (ขอสแปร์)']);
      lines.push(['วันที่', 'กะ', 'รหัส', 'ชื่อ-สกุล', 'ตำแหน่ง', 'เหตุผล', 'ผู้บันทึก']);
      schedLeaveInRange.value.forEach(r => lines.push([r.date, r.shift, r.guardCode || '-', r.guardName, r.position, r.reason, r.loggedBy]));
      lines.push([]);
      lines.push(['สแปร์ที่มาปฏิบัติงาน']);
      lines.push(['วันที่', 'กะ', 'แทนจุด', 'รหัส', 'ชื่อ-สกุล', 'หมายเหตุ', 'ผู้บันทึก']);
      schedSpareInRange.value.forEach(r => lines.push([r.date, r.shift, r.positionText || '-', r.code || '-', r.name, r.note || '', r.loggedBy]));
      return lines.map(l => l.map(csvCell).join(',')).join('\r\n');
    }

    function exportScheduleCsv() {
      if (!isAdmin.value) return;
      const blob = new Blob(['\ufeff' + buildScheduleCsv()], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `schedule_${schedStartDate.value}_${schedEndDate.value}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
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
      saveSchedule(guard);
    }

    function countShifts(guard, shiftChar) {
      if (!guard || !guard.shifts) return 0;
      return guard.shifts.filter(s => s === shiftChar).length;
    }

    // ชั่วโมงรวมในรอบ และชั่วโมงสูงสุดต่อ "สัปดาห์ปฏิทิน (จันทร์-อาทิตย์)" ใช้ตรวจ GDDL ไม่เกิน 60 ชม./สัปดาห์
    // หมายเหตุ: สัปดาห์ที่คาบเกี่ยวหัว/ท้ายรอบ (เริ่ม 23 / สิ้นสุด 22) จะนับเฉพาะวันที่อยู่ในรอบที่เลือก
    function weeklyHoursStats(guard) {
      if (!guard || !guard.shifts) return { total: 0, maxWeek: 0 };
      const days = currentCycleDays.value;
      const hrs = guard.shifts.map(s => shiftHours(guard.position, s));
      const total = hrs.reduce((a, b) => a + b, 0);
      let maxWeek = 0;
      let weekSum = 0;
      hrs.forEach((h, i) => {
        if (i > 0 && days[i] && days[i].date.getDay() === 1) { // เริ่มสัปดาห์ใหม่ที่วันจันทร์
          maxWeek = Math.max(maxWeek, weekSum);
          weekSum = 0;
        }
        weekSum += h;
      });
      maxWeek = Math.max(maxWeek, weekSum);
      return { total, maxWeek };
    }

    function checkGDDL(guard) {
      if (!guard) return true;
      return weeklyHoursStats(guard).maxWeek <= GDDL_MAX_WEEK_HOURS;
    }

    function isWeekend(dateObj) {
      const d = dateObj.getDay();
      return d === 0 || d === 6;
    }

    function getShiftStyle(shift, isDateSelected = false) {
      if (isDateSelected) {
        switch (shift) {
          case 'D': return 'bg-amber-300 text-amber-950 border-amber-500 ring-1 ring-amber-400 font-black';
          case 'N': return 'bg-indigo-300 text-indigo-950 border-indigo-500 ring-1 ring-indigo-400 font-black';
          case 'H': return 'bg-slate-300 text-slate-700 border-slate-400 ring-1 ring-slate-400 font-bold';
          case 'L': return 'bg-red-300 text-red-950 border-red-500 ring-1 ring-red-400 font-black';
          case 'PH': return 'bg-purple-300 text-purple-950 border-purple-500 ring-1 ring-purple-400 font-black';
          default: return 'bg-amber-100 text-slate-900 ring-1 ring-amber-300';
        }
      }
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

    // จำนวนวันลาของ guard ที่เลือก ในรอบที่แสดงอยู่
    const selectedGuardLeaveDays = computed(() => {
      if (!selectedGuard.value) return 0;
      const g = selectedGuard.value;
      // นับจาก leaveRecords
      const fromLeave = leaveRecords.value.filter(r => r.guardNo === g.no).length;
      // นับจากเซลล์ที่เป็น L ในตาราง (กรณีแก้ไขตรงๆ)
      const fromShift = (g.shifts || []).filter(s => s === 'L').length;
      return Math.max(fromLeave, fromShift);
    });

    const selectedGuardStats = computed(() => {
      if (!selectedGuard.value) return null;
      const st = weeklyHoursStats(selectedGuard.value);
      return { total: st.total, maxWeek: st.maxWeek, ok: st.maxWeek <= GDDL_MAX_WEEK_HOURS };
    });

    function selectTab(tab) {
      if (tab === 'billing' && !isAdmin.value) {
        alert('🔒 หัวข้อ "วางบิล (Billing Summary)" สงวนสิทธิ์เฉพาะ Admin (Site Manager) เท่านั้น ตามข้อกำหนดข้อ 7');
        return;
      }
      if (tab === 'schedule_print' && !isAdmin.value) {
        alert('🔒 หัวข้อ "ตารางเวรรวม (พิมพ์/Export)" สงวนสิทธิ์เฉพาะ Admin (Site Manager) เท่านั้น');
        return;
      }
      if (tab === 'billing' || tab === 'schedule_print') {
        cloudCycleCache.value = {}; // เข้าหน้าวางบิล/พิมพ์ตารางทุกครั้ง โหลดตารางรอบอื่นจากระบบกลางใหม่
        loadBillingCycles();
        loadCyclesForDays(schedRangeDays.value);
      }
      currentTab.value = tab;
    }

    // =========================================================================
    // CLOUD SYNC (Firestore) — โครงสร้างข้อมูล:
    //   users/{uid}                    บัญชี + สิทธิ์ (role/status)
    //   roster/main                    { staff: [...] }  ทะเบียน รปภ.ประจำ 39 ตำแหน่ง
    //   settings/holidays              { list: [...] }   วันนักขัตฤกษ์
    //   leaveRecords/{id}              บันทึกคนลา/คนแทน
    //   schedules/{cycleId}/rows/{no}  แถวตารางเวรที่ถูกแก้ไข (แถวที่ไม่เคยแก้ใช้ค่าจากแพทเทิร์น)
    // =========================================================================
    const cloudCycleCache = ref({});
    let unsubRows = null;
    let rowsCycleId = null;

    function cloudWriteError(e) {
      console.warn('เขียน Firestore ไม่สำเร็จ', e);
      if (e && e.code === 'permission-denied') {
        alert('⛔ ไม่มีสิทธิ์บันทึกข้อมูล (ยังไม่ได้เข้าสู่ระบบ / บัญชีถูกระงับ / ยังไม่ได้รับอนุมัติ)\nข้อมูลบนหน้าจอจะถูกคืนค่าตามระบบกลาง');
      } else {
        alert('⚠️ บันทึกข้อมูลขึ้นระบบกลางไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
      }
    }

    function cloudWrite(promise) {
      Promise.resolve(promise).catch(cloudWriteError);
    }

    // แบ่งเขียนทีละ 20 รายการ (ลดความเสี่ยงชน limit ของ Rules ที่ใช้ get() ตรวจสิทธิ์)
    function commitOps(ops) {
      const CHUNK = 20;
      const jobs = [];
      for (let i = 0; i < ops.length; i += CHUNK) {
        const batch = fbDb.batch();
        ops.slice(i, i + CHUNK).forEach(fn => fn(batch));
        jobs.push(batch.commit());
      }
      return Promise.all(jobs);
    }

    function cloudSaveRows(cycleId, rows) {
      if (!currentUser.value) return; // รปภ.ทั่วไปแก้ไม่ได้ (Rules บังคับอีกชั้น)
      const col = fbDb.collection('schedules').doc(cycleId).collection('rows');
      cloudWrite(commitOps(rows.map(r => batch => batch.set(col.doc(String(r.no)), plain(r)))));
    }

    // แก้แถวของรอบใดก็ได้ในระบบกลาง (ใช้ตอนยกเลิกการลาของรอบที่ไม่ได้เปิดอยู่)
    async function cloudPatchRow(cycleId, no, mutate) {
      const cycle = payrollCycles.value.find(c => c.id === cycleId);
      if (!cycle) return;
      try {
        const ref = fbDb.collection('schedules').doc(cycleId).collection('rows').doc(String(no));
        const snap = await ref.get();
        const row = snap.exists ? snap.data() : buildCycleRows(cycle).find(r => r.no === no);
        if (!row) return;
        if (mutate(row)) await ref.set(plain(row));
      } catch (e) {
        cloudWriteError(e);
      }
    }

    // นำแถวที่แก้ไขในระบบกลางมาทับแถวจากแพทเทิร์น แล้วซิงก์ชื่อ/ตำแหน่งตามทะเบียนล่าสุด
    function overlayRows(base, cloudRows, cycle) {
      const len = getCycleDays(cycle).length;
      cloudRows.forEach(cr => {
        if (!cr || !Array.isArray(cr.shifts) || cr.shifts.length !== len) return;
        const i = base.findIndex(r => r.no === cr.no);
        if (i !== -1) base[i] = cr;
      });
      syncRowsWithRoster(base);
      return base;
    }

    function subscribeCycleRows(cycle) {
      if (unsubRows) { unsubRows(); unsubRows = null; }
      rowsCycleId = cycle.id;
      unsubRows = fbDb.collection('schedules').doc(cycle.id).collection('rows').onSnapshot(snap => {
        if (rowsCycleId !== cycle.id || snap.metadata.hasPendingWrites) return;
        scheduleData.value = overlayRows(buildCycleRows(cycle), snap.docs.map(d => d.data()), cycle);
        cloudStatus.value = 'online';
      }, err => {
        console.warn('อ่านตารางเวรจากระบบกลางไม่ได้', err);
        cloudStatus.value = 'error';
      });
    }

    // โหลดตารางของรอบอื่นที่ช่วงวางบิลคาบเกี่ยว (รอบที่เปิดอยู่ใช้ข้อมูลสดอยู่แล้ว)
    function loadBillingCycles() {
      return loadCyclesForDays(billingDays.value);
    }

    async function loadCyclesForDays(days) {
      if (!CLOUD_ENABLED) return;
      const ids = new Set();
      days.forEach(d => ids.add(cycleIdForDate(d.date)));
      for (const id of ids) {
        if (id === currentCycle.value.id || cloudCycleCache.value[id]) continue;
        const cycle = payrollCycles.value.find(c => c.id === id);
        if (!cycle) continue;
        try {
          const snap = await fbDb.collection('schedules').doc(id).collection('rows').get();
          cloudCycleCache.value = {
            ...cloudCycleCache.value,
            [id]: overlayRows(buildCycleRows(cycle), snap.docs.map(d => d.data()), cycle)
          };
        } catch (e) {
          console.warn('โหลดตารางรอบ ' + id + ' ไม่ได้', e);
        }
      }
    }

    function startCloudListeners() {
      const onErr = what => err => {
        console.warn('อ่านข้อมูลจากระบบกลางไม่ได้: ' + what, err);
        cloudStatus.value = 'error';
      };

      fbDb.collection('roster').doc('main').onSnapshot(snap => {
        if (snap.metadata.hasPendingWrites) return;
        const staff = snap.exists ? snap.data().staff : null;
        if (Array.isArray(staff) && staff.length) permanentStaff.value = staff;
        syncRowsWithRoster(scheduleData.value);
        cloudStatus.value = 'online';
      }, onErr('roster'));

      fbDb.collection('settings').doc('holidays').onSnapshot(snap => {
        if (snap.metadata.hasPendingWrites) return;
        const list = snap.exists ? snap.data().list : null;
        if (Array.isArray(list)) publicHolidays.value = list;
        cloudStatus.value = 'online';
      }, onErr('holidays'));

      fbDb.collection('leaveRecords').onSnapshot(snap => {
        if (snap.metadata.hasPendingWrites) return;
        leaveRecords.value = snap.docs
          .map(d => d.data())
          .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
        cloudStatus.value = 'online';
      }, onErr('leaveRecords'));

      fbDb.collection('spareArrivals').onSnapshot(snap => {
        if (snap.metadata.hasPendingWrites) return;
        spareArrivals.value = snap.docs.map(d => d.data());
        sortSpareArrivals();
        cloudStatus.value = 'online';
      }, onErr('spareArrivals'));

      fbDb.collection('settings').doc('regular_spares').onSnapshot(snap => {
        if (snap.metadata.hasPendingWrites) return;
        const list = snap.exists ? snap.data().list : null;
        if (Array.isArray(list)) regularSpares.value = list;
      }, onErr('regular_spares'));
    }

    // Admin: ย้ายข้อมูลที่เคยแก้ไว้ใน localStorage ของเครื่องนี้ ขึ้นระบบกลาง (ทำครั้งเดียว)
    async function migrateLocalToCloud() {
      if (!CLOUD_ENABLED || !isAdmin.value) return;
      if (!confirm('ย้ายข้อมูลที่บันทึกไว้ในเครื่องนี้ขึ้นระบบกลางหรือไม่?\n\n- ทะเบียน รปภ.ประจำ และวันนักขัตฤกษ์ จะทับข้อมูลในระบบกลาง\n- เฉพาะแถวตารางเวรที่เคยแก้ไข/มีบันทึกลา จะถูกอัปโหลด\n- บัญชีผู้ใช้เดิมในเครื่อง (รหัสผ่านแบบเก่า) จะไม่ถูกย้าย\n- ข้อมูลในเครื่องยังอยู่เหมือนเดิม')) return;

      const sum = { staff: 0, holidays: 0, leaves: 0, spares: 0, rows: 0, cycles: 0 };
      try {
        const staff = safeParse('sws_permanent_staff', null);
        if (Array.isArray(staff) && staff.length) {
          await fbDb.collection('roster').doc('main').set({ staff: plain(staff) });
          sum.staff = staff.length;
        }
        const hol = safeParse('sws_public_holidays', null);
        if (Array.isArray(hol)) {
          await fbDb.collection('settings').doc('holidays').set({ list: plain(hol) });
          sum.holidays = hol.length;
        }
        const leaves = safeParse('sws_leave_records', []);
        if (Array.isArray(leaves) && leaves.length) {
          await commitOps(leaves.map(r => batch => batch.set(fbDb.collection('leaveRecords').doc(String(r.id)), plain(r))));
          sum.leaves = leaves.length;
        }
        const spares = safeParse('sws_spare_arrivals', []);
        if (Array.isArray(spares) && spares.length) {
          await commitOps(spares.map(r => batch => batch.set(fbDb.collection('spareArrivals').doc(String(r.id)), plain(r))));
          sum.spares = spares.length;
        }
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.indexOf('sws_schedule_v3_') === 0) keys.push(k);
        }
        for (const key of keys) {
          const cycleId = key.replace('sws_schedule_v3_', '');
          const cycle = payrollCycles.value.find(c => c.id === cycleId);
          const rows = safeParse(key, null);
          if (!cycle || !Array.isArray(rows)) continue;
          const base = buildCycleRows(cycle);
          const changed = rows.filter(r => {
            const b = base.find(x => x.no === r.no);
            return b && Array.isArray(r.shifts) && (JSON.stringify(b.shifts) !== JSON.stringify(r.shifts) || r.replacementName);
          });
          if (!changed.length) continue;
          const col = fbDb.collection('schedules').doc(cycleId).collection('rows');
          await commitOps(changed.map(r => batch => batch.set(col.doc(String(r.no)), plain(r))));
          sum.rows += changed.length;
          sum.cycles++;
        }
        alert(`✅ ย้ายข้อมูลขึ้นระบบกลางสำเร็จ\n- รายชื่อ รปภ.ประจำ: ${sum.staff} ตำแหน่ง\n- วันนักขัตฤกษ์: ${sum.holidays} วัน\n- บันทึกคนลา: ${sum.leaves} รายการ\n- สแปร์ที่มาปฏิบัติงาน: ${sum.spares} รายการ\n- แถวตารางเวรที่แก้ไข: ${sum.rows} แถว (${sum.cycles} รอบ)`);
      } catch (e) {
        cloudWriteError(e);
      }
    }

    onMounted(() => {
      initUsers();
      initHolidays();
      initPermanentStaff();
      initLeaveRecords();
      initSpareArrivals();
      initRegularSpares();
      initSchedule();
      if (CLOUD_ENABLED) startCloudListeners();
      // อัปเดตเวลาทุกนาที เพื่อให้สถานะ "รอสแปร์ -> ขาด" เปลี่ยนเองเมื่อหมดกะ
      if (typeof setInterval === 'function') setInterval(() => { nowTick.value = Date.now(); }, 60000);
    });

    watch(selectedCycleIndex, () => {
      initSchedule();
      // ตั้งช่วงวางบิลเริ่มต้นให้ตรงกับรอบที่เลือก (ผู้ใช้ยังแก้เองได้)
      const c = currentCycle.value;
      billingStartDate.value = fmtDate(new Date(c.startYear, c.startMonthNum - 1, 23));
      billingEndDate.value = fmtDate(new Date(c.endYear, c.endMonthNum - 1, 22));
      schedStartDate.value = fmtDate(new Date(c.startYear, c.startMonthNum - 1, 23));
      schedEndDate.value = fmtDate(new Date(c.endYear, c.endMonthNum - 1, 22));
    });

    watch([billingStartDate, billingEndDate], () => {
      loadBillingCycles();
    });

    watch([schedStartDate, schedEndDate], () => {
      loadCyclesForDays(schedRangeDays.value);
    });

    // ฟอร์มบันทึกสแปร์: เลือกวันที่ในรอบอื่น -> โหลดตารางรอบนั้นมาเพื่อแสดงจุดที่ต้องการสแปร์
    watch([() => spareForm.value.date, showSpareModal], () => {
      if (showSpareModal.value && spareForm.value.date) loadCyclesForDays([{ date: parseDate(spareForm.value.date) }]);
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
      cloudEnabled: CLOUD_ENABLED,
      activeStaff,
      nowTick,
      spareArrivals,
      showSpareModal,
      spareForm,
      openSpareModal,
      submitSpare,
      cancelSpare,
      spareDayStats,
      spareSpotOptions,
      pinUnlocked,
      pinInput,
      pinError,
      pinRemember,
      submitPin,
      lockApp,
      spareTotals,
      spareShortagePoints,
      selectedDateStr,
      toggleSelectDate,
      selectedSpareDate,
      selectSpareDate,
      spareStatusText,
      spareStatusClass,
      schedStartDate,
      schedEndDate,
      schedRangeDays,
      schedRangeTruncated,
      schedPrint,
      schedLeaveInRange,
      schedSpareInRange,
      printSchedule,
      buildScheduleCsv,
      exportScheduleCsv,
      cloudStatus,
      authReady,
      migrateLocalToCloud,
      checkGDDL,
      weeklyHoursStats,
      gddlMaxWeekHours: GDDL_MAX_WEEK_HOURS,
      selectedGuardStats,
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
      guardWorkHoursText,
      selectedGuardLeaveDays,
      showChangePasswordModal,
      changePasswordForm,
      changePasswordError,
      changePasswordLoading,
      openChangePasswordModal,
      handleChangePassword,
      // สแปร์ประจำ
      regularSpares,
      showRegularSpareMgr,
      regularSpareForm,
      addRegularSpare,
      removeRegularSpare,
      pickRegularSpare,
      // แก้ไขรายการสแปร์ย้อนหลัง (Admin)
      editingSpareId,
      spareEditForm,
      startEditSpare,
      cancelEditSpare,
      saveEditSpare
    };
  }
}).mount('#app');

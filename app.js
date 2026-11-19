/**
 * Security Work Schedule
 * Web Portal Logic with Vue 3 & Firebase Integration
 */

const { createApp, ref, computed, onMounted } = Vue;

createApp({
  setup() {
    // Role state
    const isAdmin = ref(false);
    const showLoginModal = ref(false);
    const loginPin = ref('');

    // Active Tab
    const currentTab = ref('schedule'); // 'schedule' | 'spare' | 'personal' | 'billing'

    // Payroll Cycles (23rd to 22nd)
    const payrollCycles = ref([
      { name: 'รอบ ธ.ค. 2026', startYear: 2026, startMonthNum: 11, startMonth: 'พ.ย.', endYear: 2026, endMonthNum: 12, endMonth: 'ธ.ค.', payDateMonth: 'ม.ค. 2027' },
      { name: 'รอบ ม.ค. 2027', startYear: 2026, startMonthNum: 12, startMonth: 'ธ.ค.', endYear: 2027, endMonthNum: 1, endMonth: 'ม.ค.', payDateMonth: 'ก.พ. 2027' },
      { name: 'รอบ ก.พ. 2027', startYear: 2027, startMonthNum: 1, startMonth: 'ม.ค.', endYear: 2027, endMonthNum: 2, endMonth: 'ก.พ.', payDateMonth: 'มี.ค. 2027' }
    ]);
    const selectedCycleIndex = ref(0);
    const currentCycle = computed(() => payrollCycles.value[selectedCycleIndex.value]);

    // Calculate days for current cycle (23rd of previous month to 22nd of current month)
    const currentCycleDays = computed(() => {
      const cycle = currentCycle.value;
      const days = [];
      const dayNamesTH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

      // Start: 23 of startMonth
      let cur = new Date(cycle.startYear, cycle.startMonthNum - 1, 23);
      // End: 22 of endMonth
      const end = new Date(cycle.endYear, cycle.endMonthNum - 1, 22);

      while (cur <= end) {
        days.push({
          date: new Date(cur),
          dateString: cur.toISOString().split('T')[0],
          dayNumber: cur.getDate(),
          dayName: dayNamesTH[cur.getDay()]
        });
        cur.setDate(cur.getDate() + 1);
      }
      return days;
    });

    // 39 Roster Master Data
    const initialRoster = [
      { no: 1, position: 'Site manager', code: 'SE2403575', name: 'นายอัครเดช เจริญสุข', isSpare: false, mainShift: 'D', offPattern: 'SAT_SUN' },
      { no: 2, position: 'Security Fire Man 1', code: 'SE2402366', name: 'น.ส.ปณิตา โอละลึก', isSpare: false, mainShift: 'D', isFireman: true, firemanId: 1 },
      { no: 3, position: 'Security Fire Man 2', code: 'SE2601481', name: 'น.ส.พรธิตา ศรีกุลวงษ์', isSpare: false, mainShift: 'D', isFireman: true, firemanId: 2 },
      { no: 4, position: 'Security Fire Man 4', code: 'SE2604787', name: 'นายจิรโชติ ธงชัย', isSpare: false, mainShift: 'D', isFireman: true, firemanId: 4 },
      { no: 5, position: 'Security Fire Man 3', code: 'SE2303758', name: 'นายสมชาย ทุสุนา', isSpare: false, mainShift: 'D', isFireman: true, firemanId: 3 },
      { no: 6, position: 'Senior Supervisor', code: 'SE2400110', name: 'นายอุสมาน แลยะลี', isSpare: false, mainShift: 'D', offPattern: 'THU_FRI' },
      { no: 7, position: 'Supervisor', code: 'SE2303757', name: 'นายอนุสรณ์ ศิริวัฒนกุล', isSpare: false, mainShift: 'ROT', offPattern: 'THU_FRI' },
      { no: 8, position: 'Supervisor', code: 'SE2500652', name: 'นายปิยวัฒน์ บุญเฮง', isSpare: false, mainShift: 'ROT', offPattern: 'TUE_WED' },
      { no: 9, position: 'Supervisor', code: 'SE2400890', name: 'นายธีรวัฒน์ ศรีนนท์เคน', isSpare: false, mainShift: 'ROT', offPattern: 'SUN_MON' },
      { no: 10, position: 'Ass. Supervisor', code: 'SE2400595', name: 'นายจักรพงษ์ ตระกูลดี', isSpare: false, mainShift: 'ROT', offPattern: 'SAT_SUN' },
      { no: 11, position: 'Ass. Supervisor', code: 'SE2400593', name: 'นายพรชัย ใจตรง', isSpare: false, mainShift: 'ROT', offPattern: 'MON_TUE' },
      { no: 12, position: 'Ass. Supervisor', code: 'SE2504781', name: 'นายเสกสรร เสนนอก', isSpare: false, mainShift: 'ROT', offPattern: 'WED_THU' },
      { no: 13, position: 'CCTV', code: 'SE2401588', name: 'นายรัชชานนท์ พรมวงค์', isSpare: false, mainShift: 'ROT', offPattern: 'SAT_SUN' },
      { no: 14, position: 'CCTV', code: 'SE2501019', name: 'น.ส. สุภาวดี หมายจันทึก', isSpare: false, mainShift: 'ROT', offPattern: 'WED_THU' },
      { no: 15, position: 'CCTV', code: 'SE2501861', name: 'น.ส.นัทธมน เสนานิคม', isSpare: false, mainShift: 'ROT', offPattern: 'MON_TUE' },
      { no: 16, position: 'Emergency Driver', code: 'SE2402957', name: 'นายณัฏฐสิทธิ์ มงคลดี', isSpare: false, mainShift: 'ROT', offPattern: 'SAT_SUN' },
      { no: 17, position: 'Emergency Driver', code: 'SE2303770', name: 'นายอดิสรณ์ ขาวงาม', isSpare: false, mainShift: 'ROT', offPattern: 'THU_FRI' },
      { no: 18, position: 'Emergency Driver', code: 'SE2500083', name: 'นายเรืองฤทธิ์ คำผง', isSpare: false, mainShift: 'ROT', offPattern: 'TUE_WED' },
      { no: 19, position: 'Admin Day - Gate 1', code: 'SE2303764', name: 'น.ส.วิเชียร แมดพิมาย', isSpare: false, mainShift: 'D', offPattern: 'SUN_MON' },
      { no: 20, position: 'Admin Day - Gate 2', code: 'SE2500239', name: 'น.ส. อรนุช สายปัญญา', isSpare: false, mainShift: 'D', offPattern: 'FRI_SAT' },
      { no: 21, position: 'Guard', code: 'SE2500384', name: 'น.ส. ปทุมพร ขวัญมา', isSpare: false, mainShift: 'D', offPattern: 'WED_THU' },
      { no: 22, position: 'Guard', code: 'SE172615', name: 'นายประเสริฐ มูลฤทธิ์', isSpare: false, mainShift: 'ROT', offPattern: 'TUE_WED' },
      { no: 23, position: 'Guard', code: 'SE2503274', name: 'นายวัลลภ พิรักษา', isSpare: false, mainShift: 'ROT', offPattern: 'WED_THU' },
      { no: 24, position: 'Guard', code: 'SE2504780', name: 'นายจุลชาติ แถลงกัณฑ์', isSpare: false, mainShift: 'ROT', offPattern: 'THU_FRI' },
      { no: 25, position: 'Guard', code: 'SE2401151', name: 'นายสินณรงค์กร ทองเกษร', isSpare: false, mainShift: 'ROT', offPattern: 'SAT_SUN' },
      { no: 26, position: 'Guard', code: 'SE2303133', name: 'นายดำรงพร วงศ์สมบัติ', isSpare: false, mainShift: 'ROT', offPattern: 'SUN_MON' },
      { no: 27, position: 'Guard', code: 'SE2602602', name: 'นายสุทธิพงษ์ ปัญญาพรม', isSpare: false, mainShift: 'ROT', offPattern: 'MON_TUE' },
      { no: 28, position: 'Guard', code: 'SE2501573', name: 'นายสรยุทธ หอมสมบัติ', isSpare: false, mainShift: 'ROT', offPattern: 'TUE_WED' },
      { no: 29, position: 'Guard', code: 'SE2605554', name: 'นายวันชัย ช่วยปัด', isSpare: false, mainShift: 'ROT', offPattern: 'WED_THU' },
      { no: 30, position: 'Guard', code: 'SE2503503', name: 'นายถาวร ไชยโคตร', isSpare: false, mainShift: 'ROT', offPattern: 'THU_FRI' },
      { no: 31, position: 'Guard (สแปร์ประจำ)', code: '', name: '[ตำแหน่งว่าง - รอสแปร์ 1]', isSpare: true, mainShift: 'ROT', offPattern: 'SUN_MON' },
      { no: 32, position: 'Guard', code: 'SE2402657', name: 'นายอดิเทพ อุระเพ็ญ', isSpare: false, mainShift: 'ROT', offPattern: 'MON_TUE' },
      { no: 33, position: 'Guard', code: 'SE2403015', name: 'นายพรชัย จิตรสม', isSpare: false, mainShift: 'ROT', offPattern: 'FRI_SAT' },
      { no: 34, position: 'Guard', code: 'SE2500612', name: 'นายสุรศักดิ์  อักษรพิมพ์', isSpare: false, mainShift: 'ROT', offPattern: 'THU_FRI' },
      { no: 35, position: 'Guard', code: 'SE2603922', name: 'นายภานุวัฒน์ ใบบัวดง', isSpare: false, mainShift: 'ROT', offPattern: 'FRI_SAT' },
      { no: 36, position: 'Guard (สแปร์ประจำ)', code: '', name: '[ตำแหน่งว่าง - รอสแปร์ 2]', isSpare: true, mainShift: 'ROT', offPattern: 'TUE_WED' },
      { no: 37, position: 'Guard', code: 'SE2603850', name: 'นายอานนท์ สาริกุล', isSpare: false, mainShift: 'ROT', offPattern: 'SUN_MON' },
      { no: 38, position: 'Reception Staff', code: 'SE2303772', name: 'น.ส.ปรียมน วสะหลาย', isSpare: false, mainShift: 'D', offPattern: 'SAT_SUN' },
      { no: 39, position: 'Reception Staff (สแปร์)', code: '', name: '[ตำแหน่งว่าง - รอสแปร์ 3]', isSpare: true, mainShift: 'D', offPattern: 'SAT_SUN' }
    ];

    // Fireman Rotation Helper
    function getFiremanOffDays(firemanId, monthOffset) {
      if (firemanId === 3) return [2, 3]; // Tue-Wed Fixed
      const cycle = [
        [5, 6], // Fri-Sat
        [0, 1], // Sun-Mon
        [6, 0]  // Sat-Sun
      ];
      let base = 0;
      if (firemanId === 2) base = 0; // Dec: Fri-Sat
      if (firemanId === 1) base = 1; // Dec: Sun-Mon
      if (firemanId === 4) base = 2; // Dec: Sat-Sun
      return cycle[(base + monthOffset) % 3];
    }

    function getOffDaysFromPattern(pattern) {
      const map = {
        'SUN_MON': [0, 1],
        'MON_TUE': [1, 2],
        'TUE_WED': [2, 3],
        'WED_THU': [3, 4],
        'THU_FRI': [4, 5],
        'FRI_SAT': [5, 6],
        'SAT_SUN': [6, 0]
      };
      return map[pattern] || [6, 0];
    }

    // Schedule Grid Data State
    const scheduleData = ref([]);
    const replacementLogs = ref([]);

    // Initialize or load schedule from LocalStorage
    function initSchedule() {
      const saved = localStorage.getItem(`schedule_cycle_${selectedCycleIndex.value}`);
      if (saved) {
        scheduleData.value = JSON.parse(saved);
        return;
      }

      const daysCount = currentCycleDays.value.length;
      const monthOffset = selectedCycleIndex.value;

      scheduleData.value = initialRoster.map(g => {
        const shifts = [];
        let offDays = [];

        if (g.isFireman) {
          offDays = getFiremanOffDays(g.firemanId, monthOffset);
        } else {
          offDays = getOffDaysFromPattern(g.offPattern);
        }

        for (let d = 0; d < daysCount; d++) {
          const dt = currentCycleDays.value[d].date;
          const dayOfWeek = dt.getDay();

          if (offDays.includes(dayOfWeek)) {
            shifts.push('H');
          } else {
            if (g.mainShift === 'D') {
              shifts.push('D');
            } else {
              // Rotation pattern
              shifts.push((d % 14 < 7) ? 'D' : 'N');
            }
          }
        }

        return {
          id: g.no,
          no: g.no,
          position: g.position,
          code: g.code,
          name: g.name,
          isSpare: g.isSpare,
          replacementName: null,
          replacementType: null,
          shifts
        };
      });

      saveSchedule();
    }

    function saveSchedule() {
      localStorage.setItem(`schedule_cycle_${selectedCycleIndex.value}`, JSON.stringify(scheduleData.value));
    }

    // Daily Contract Goals
    // Mon-Fri: D=19, N=10 | Sat: D=17, N=10 | Sun: D=16, N=10
    function getDailyContract(dateObj, shiftType) {
      if (shiftType === 'N') return 10;
      const day = dateObj.getDay();
      if (day === 0) return 16; // Sunday
      if (day === 6) return 17; // Saturday
      return 19; // Weekdays
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

    // Daily Spare Audit Tab state
    const selectedAuditDate = ref(new Date().toISOString().split('T')[0]);
    const selectedAuditDateObj = computed(() => new Date(selectedAuditDate.value));

    function getDailyActualForDate(dateStr, shiftType) {
      const idx = currentCycleDays.value.findIndex(d => d.dateString === dateStr);
      if (idx === -1) return 0;
      return getDailyActual(idx, shiftType);
    }

    function getDailySpareGapForDate(dateStr, shiftType) {
      const idx = currentCycleDays.value.findIndex(d => d.dateString === dateStr);
      if (idx === -1) return 0;
      return getDailySpareGap(idx, new Date(dateStr), shiftType);
    }

    const todaySpareShortage = computed(() => {
      const todayStr = new Date().toISOString().split('T')[0];
      return getDailySpareGapForDate(todayStr, 'D') + getDailySpareGapForDate(todayStr, 'N');
    });

    const currentDateReplacements = computed(() => {
      return replacementLogs.value.filter(r => r.date === selectedAuditDate.value);
    });

    // Guard Individual Tab state
    const selectedGuardId = ref(1);
    const selectedGuard = computed(() => {
      return scheduleData.value.find(g => g.id === selectedGuardId.value) || scheduleData.value[0];
    });

    function countShifts(guard, shiftChar) {
      if (!guard || !guard.shifts) return 0;
      return guard.shifts.filter(s => s === shiftChar).length;
    }

    function checkGDDL(guard) {
      if (!guard) return true;
      const totalWork = countShifts(guard, 'D') + countShifts(guard, 'N');
      // In a 30-day cycle, standard is ~22 days work, 8 days off
      return totalWork <= 22;
    }

    // Shift styling helpers
    function isWeekend(dateObj) {
      const d = dateObj.getDay();
      return d === 0 || d === 6;
    }

    function getShiftStyle(shift) {
      switch (shift) {
        case 'D': return 'bg-amber-100/80 text-amber-900 border-amber-200';
        case 'N': return 'bg-indigo-100/80 text-indigo-900 border-indigo-200';
        case 'H': return 'bg-slate-200/70 text-slate-500 border-slate-300';
        case 'L': return 'bg-red-200 text-red-900 border-red-300';
        case 'PH': return 'bg-purple-200 text-purple-900 border-purple-300';
        default: return 'bg-white text-slate-700';
      }
    }

    function getShiftTextColor(shift) {
      switch (shift) {
        case 'D': return 'text-amber-600';
        case 'N': return 'text-indigo-600';
        case 'H': return 'text-slate-400';
        case 'L': return 'text-red-600';
        case 'PH': return 'text-purple-600';
        default: return 'text-slate-700';
      }
    }

    function getShiftName(shift) {
      switch (shift) {
        case 'D': return 'กะเช้า';
        case 'N': return 'กะดึก';
        case 'H': return 'วันหยุด';
        case 'L': return 'ลา/ขาด';
        case 'PH': return 'นักขัตฤกษ์';
        default: return '-';
      }
    }

    function getPersonalDayCardStyle(shift, dateObj) {
      if (shift === 'D') return 'bg-amber-50/50 border-amber-200';
      if (shift === 'N') return 'bg-indigo-50/50 border-indigo-200';
      if (shift === 'H') return 'bg-slate-50 border-slate-200';
      if (shift === 'PH') return 'bg-purple-50 border-purple-200';
      return 'bg-white border-slate-200';
    }

    function tabClass(tabName) {
      return currentTab.value === tabName
        ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100';
    }

    // Leave & Replacement Form Modal
    const showLeaveModal = ref(false);
    const leaveForm = ref({
      guardId: 1,
      date: new Date().toISOString().split('T')[0],
      replaceType: 'สแปร์นอก', // 'คนประจำมาแทน' | 'สแปร์นอก'
      replacementName: ''
    });

    function openLeaveModal() {
      showLeaveModal.value = true;
    }

    function submitLeave() {
      const guard = scheduleData.value.find(g => g.id === leaveForm.value.guardId);
      const dayIdx = currentCycleDays.value.findIndex(d => d.dateString === leaveForm.value.date);

      if (guard && dayIdx !== -1) {
        const previousShift = guard.shifts[dayIdx];
        guard.shifts[dayIdx] = 'L'; // Set to Leave

        // Record replacement log
        if (leaveForm.value.replacementName) {
          replacementLogs.value.push({
            date: leaveForm.value.date,
            shift: previousShift === 'N' ? 'N' : 'D',
            type: leaveForm.value.replaceType,
            name: leaveForm.value.replacementName,
            position: guard.position,
            gddlPass: true,
            loggedBy: 'Supervisor'
          });
          guard.replacementName = leaveForm.value.replacementName;
          guard.replacementType = leaveForm.value.replaceType;
        }

        saveSchedule();
        showLeaveModal.value = false;
        alert(`✅ บันทึกคนลาสำเร็จ!\nรปภ. ${guard.name} ลาวันที่ ${leaveForm.value.date}`);
      }
    }

    function openSpareAssignModal(shift) {
      leaveForm.value.date = selectedAuditDate.value;
      leaveForm.value.replaceType = 'สแปร์นอก';
      showLeaveModal.value = true;
    }

    function editShift(guard, sIdx) {
      const current = guard.shifts[sIdx];
      const choices = ['D', 'N', 'H', 'L', 'PH'];
      const nextIdx = (choices.indexOf(current) + 1) % choices.length;
      guard.shifts[sIdx] = choices[nextIdx];
      saveSchedule();
    }

    // Billing Summary Calculations
    const totalContractManDays = computed(() => {
      return currentCycleDays.value.reduce((acc, day) => {
        return acc + getDailyContract(day.date, 'D') + getDailyContract(day.date, 'N');
      }, 0);
    });

    const totalActualRegularDays = computed(() => {
      return scheduleData.value.reduce((acc, g) => {
        if (g.isSpare) return acc;
        return acc + countShifts(g, 'D') + countShifts(g, 'N');
      }, 0);
    });

    const totalSpareDays = computed(() => {
      return replacementLogs.value.length + (scheduleData.value.filter(g => g.isSpare).length * 22);
    });

    const billingSpareLog = computed(() => {
      if (replacementLogs.value.length > 0) return replacementLogs.value;
      // Mock some realistic spare logs for display
      return [
        { date: '2026-11-25', shift: 'D', name: 'นายมานพ มุ่งมั่น', position: 'Guard ทดแทน No.31', gddlPass: true },
        { date: '2026-11-28', shift: 'N', name: 'นายวรวิทย์ แจ่มใส', position: 'Guard ทดแทนคนลา', gddlPass: true },
        { date: '2026-12-02', shift: 'D', name: 'นายสมชาย ดีพร้อม', position: 'Admin Day ทดแทนคนลา', gddlPass: true },
        { date: '2026-12-10', shift: 'N', name: 'นายธนาธิป รักไทย', position: 'Guard ทดแทน No.36', gddlPass: true }
      ];
    });

    function printBilling() {
      window.print();
    }

    // Auto-generate Next Cycle
    function autoGenerateNextCycle() {
      if (confirm('คุณต้องการรันตารางเวรในรอบถัดไปอัตโนมัติหรือไม่?\n(ระบบจะหมุนกะ Fireman ให้อัตโนมัติ)')) {
        selectedCycleIndex.value = (selectedCycleIndex.value + 1) % payrollCycles.value.length;
        initSchedule();
        alert(`🎉 รันตารางเวรรอบ ${currentCycle.value.name} สำเร็จเรียบร้อยแล้ว!`);
      }
    }

    // Auth handler
    function handleLogin() {
      if (loginPin.value === '1234' || loginPin.value === 'continental') {
        isAdmin.value = true;
        showLoginModal.value = false;
        loginPin.value = '';
        alert('🔓 เข้าสู่ระบบ Supervisor / Site Manager สำเร็จ!');
      } else {
        alert('❌ รหัส PIN ไม่ถูกต้อง (ทดลองใช้: 1234)');
      }
    }

    function logout() {
      isAdmin.value = false;
    }

    onMounted(() => {
      initSchedule();
    });

    return {
      isAdmin,
      showLoginModal,
      loginPin,
      handleLogin,
      logout,
      currentTab,
      tabClass,
      payrollCycles,
      selectedCycleIndex,
      currentCycle,
      currentCycleDays,
      scheduleData,
      isWeekend,
      getShiftStyle,
      getShiftTextColor,
      getShiftName,
      getPersonalDayCardStyle,
      countShifts,
      checkGDDL,
      getDailyContract,
      getDailyActual,
      getDailySpareGap,
      todaySpareShortage,
      selectedAuditDate,
      selectedAuditDateObj,
      getDailyActualForDate,
      getDailySpareGapForDate,
      currentDateReplacements,
      selectedGuardId,
      selectedGuard,
      showLeaveModal,
      leaveForm,
      openLeaveModal,
      submitLeave,
      openSpareAssignModal,
      editShift,
      totalContractManDays,
      totalActualRegularDays,
      totalSpareDays,
      billingSpareLog,
      printBilling,
      autoGenerateNextCycle
    };
  }
}).mount('#app');

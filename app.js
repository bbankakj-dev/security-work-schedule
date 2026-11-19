/**
 * Security Work Schedule
 * Web Portal Logic with Exact Master Draft Integration & GDDL Compliance
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

    // Payroll Cycles (23rd of previous month to 22nd of current month)
    const payrollCycles = ref([
      { id: 'dec', name: 'รอบ ธ.ค. 2026', startYear: 2026, startMonthNum: 11, startMonth: 'พ.ย.', endYear: 2026, endMonthNum: 12, endMonth: 'ธ.ค.', payDateMonth: 'ม.ค. 2027', days: 30, monthOffset: 0 },
      { id: 'nov', name: 'รอบ พ.ย. 2026', startYear: 2026, startMonthNum: 10, startMonth: 'ต.ค.', endYear: 2026, endMonthNum: 11, endMonth: 'พ.ย.', payDateMonth: 'ธ.ค. 2026', days: 31, monthOffset: 2 },
      { id: 'jan', name: 'รอบ ม.ค. 2027', startYear: 2026, startMonthNum: 12, startMonth: 'ธ.ค.', endYear: 2027, endMonthNum: 1, endMonth: 'ม.ค.', payDateMonth: 'ก.พ. 2027', days: 31, monthOffset: 1 }
    ]);
    const selectedCycleIndex = ref(0);
    const currentCycle = computed(() => payrollCycles.value[selectedCycleIndex.value]);

    // Calculate days for current cycle (23rd to 22nd)
    const currentCycleDays = computed(() => {
      const cycle = currentCycle.value;
      const days = [];
      const dayNamesTH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

      let cur = new Date(cycle.startYear, cycle.startMonthNum - 1, 23);
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

    // 1. DECEMBER 2026 EXACT DRAFT DATA (30 days from 23 Nov to 22 Dec)
    const decMasterData = [
      { no: 1, position: 'Site manager', code: 'SE2403575', name: 'นายอัครเดช เจริญสุข', isSpare: false,
        rawShifts: "D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D" },
      { no: 2, position: 'Security Fire Man 1', code: 'SE2402366', name: 'น.ส.ปณิตา โอละลึก', isSpare: false, isFireman: true, firemanId: 1,
        rawShifts: "H,D,D,D,D,H,D,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D" },
      { no: 3, position: 'Security Fire Man 2', code: 'SE2601481', name: 'น.ส.พรธิตา ศรีกุลวงษ์', isSpare: false, isFireman: true, firemanId: 2,
        rawShifts: "D,D,D,D,H,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D" },
      { no: 4, position: 'Security Fire Man 4', code: 'SE2604787', name: 'นายจิรโชติ ธงชัย', isSpare: false, isFireman: true, firemanId: 4,
        rawShifts: "D,D,D,D,D,H,H,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D" },
      { no: 5, position: 'Security Fire Man 3', code: 'SE2303758', name: 'นายสมชาย ทุสุนา', isSpare: false, isFireman: true, firemanId: 3,
        rawShifts: "D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H" },
      { no: 6, position: 'Senior Supervisor', code: 'SE2400110', name: 'นายอุสมาน แลยะลี', isSpare: false,
        rawShifts: "D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D" },
      { no: 7, position: 'Supervisor', code: 'SE2303757', name: 'นายอนุสรณ์ ศิริวัฒนกุล', isSpare: false,
        rawShifts: "D,D,D,H,H,D,N,N,N,N,H,H,D,D,D,D,D,H,H,D,N,N,N,N,H,H,D,D,D,D" },
      { no: 8, position: 'Supervisor', code: 'SE2500652', name: 'นายปิยวัฒน์ บุญเฮง', isSpare: false,
        rawShifts: "N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H" },
      { no: 9, position: 'Supervisor', code: 'SE2400890', name: 'นายธีรวัฒน์ ศรีนนท์เคน', isSpare: false,
        rawShifts: "H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N" },
      { no: 10, position: 'Ass. Supervisor', code: 'SE2400595', name: 'นายจักรพงษ์ ตระกูลดี', isSpare: false,
        rawShifts: "N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N" },
      { no: 11, position: 'Ass. Supervisor', code: 'SE2400593', name: 'นายพรชัย ใจตรง', isSpare: false,
        rawShifts: "H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H" },
      { no: 12, position: 'Ass. Supervisor', code: 'SE2504781', name: 'นายเสกสรร เสนนอก', isSpare: false,
        rawShifts: "D,D,H,H,D,N,N,N,N,H,H,D,D,D,D,D,H,H,D,N,N,N,N,H,H,D,D,D,D,D" },
      { no: 13, position: 'CCTV', code: 'SE2401588', name: 'นายรัชชานนท์ พรมวงค์', isSpare: false,
        rawShifts: "D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D" },
      { no: 14, position: 'CCTV', code: 'SE2501019', name: 'น.ส. สุภาวดี หมายจันทึก', isSpare: false,
        rawShifts: "N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N" },
      { no: 15, position: 'CCTV', code: 'SE2501861', name: 'น.ส.นัทธมน เสนานิคม', isSpare: false,
        rawShifts: "H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H" },
      { no: 16, position: 'Emergency Driver', code: 'SE2402957', name: 'นายณัฏฐสิทธิ์ มงคลดี', isSpare: false,
        rawShifts: "D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D" },
      { no: 17, position: 'Emergency Driver', code: 'SE2303770', name: 'นายอดิสรณ์ ขาวงาม', isSpare: false,
        rawShifts: "N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N" },
      { no: 18, position: 'Emergency Driver', code: 'SE2500083', name: 'นายเรืองฤทธิ์ คำผง', isSpare: false,
        rawShifts: "D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H" },
      { no: 19, position: 'Admin Day - Gate 1', code: 'SE2303764', name: 'น.ส.วิเชียร แมดพิมาย', isSpare: false,
        rawShifts: "H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D" },
      { no: 20, position: 'Admin Day - Gate 2', code: 'SE2500239', name: 'น.ส. อรนุช สายปัญญา', isSpare: false,
        rawShifts: "D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D" },
      { no: 21, position: 'Guard', code: 'SE2500384', name: 'น.ส. ปทุมพร ขวัญมา', isSpare: false,
        rawShifts: "D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D" },
      { no: 22, position: 'Guard', code: 'SE172615', name: 'นายประเสริฐ มูลฤทธิ์', isSpare: false,
        rawShifts: "N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H" },
      { no: 23, position: 'Guard', code: 'SE2503274', name: 'นายวัลลภ พิรักษา', isSpare: false,
        rawShifts: "N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N" },
      { no: 24, position: 'Guard', code: 'SE2504780', name: 'นายจุลชาติ แถลงกัณฑ์', isSpare: false,
        rawShifts: "N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N" },
      { no: 25, position: 'Guard', code: 'SE2401151', name: 'นายสินณรงค์กร ทองเกษร', isSpare: false,
        rawShifts: "N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N" },
      { no: 26, position: 'Guard', code: 'SE2303133', name: 'นายดำรงพร วงศ์สมบัติ', isSpare: false,
        rawShifts: "H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N" },
      { no: 27, position: 'Guard', code: 'SE2602602', name: 'นายสุทธิพงษ์ ปัญญาพรม', isSpare: false,
        rawShifts: "H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H" },
      { no: 28, position: 'Guard', code: 'SE2501573', name: 'นายสรยุทธ หอมสมบัติ', isSpare: false,
        rawShifts: "D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H" },
      { no: 29, position: 'Guard', code: 'SE2605554', name: 'นายวันชัย ช่วยปัด', isSpare: false,
        rawShifts: "D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D" },
      { no: 30, position: 'Guard', code: 'SE2503503', name: 'นายถาวร ไชยโคตร', isSpare: false,
        rawShifts: "D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D" },
      { no: 31, position: 'Guard (สแปร์ประจำ)', code: '', name: '[ตำแหน่งว่าง - สแปร์ประจำ 1]', isSpare: true,
        rawShifts: "H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D" },
      { no: 32, position: 'Guard', code: 'SE2402657', name: 'นายอดิเทพ อุระเพ็ญ', isSpare: false,
        rawShifts: "H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H" },
      { no: 33, position: 'Guard', code: 'SE2403015', name: 'นายพรชัย จิตรสม', isSpare: false,
        rawShifts: "D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D" },
      { no: 34, position: 'Guard', code: 'SE2500612', name: 'นายสุรศักดิ์  อักษรพิมพ์', isSpare: false,
        rawShifts: "N,N,N,H,H,D,D,D,N,N,H,H,D,D,N,N,N,H,H,D,D,D,N,N,H,H,D,D,N,N" },
      { no: 35, position: 'Guard', code: 'SE2603922', name: 'นายภานุวัฒน์ ใบบัวดง', isSpare: false,
        rawShifts: "D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D" },
      { no: 36, position: 'Guard (สแปร์ประจำ)', code: '', name: '[ตำแหน่งว่าง - สแปร์ประจำ 2]', isSpare: true,
        rawShifts: "N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H" },
      { no: 37, position: 'Guard', code: 'SE2603850', name: 'นายอานนท์ สาริกุล', isSpare: false,
        rawShifts: "H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N" },
      { no: 38, position: 'Reception Staff', code: 'SE2303772', name: 'น.ส.ปรียมน วสะหลาย', isSpare: false,
        rawShifts: "D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D" },
      { no: 39, position: 'Reception Staff (สแปร์)', code: '', name: '[ตำแหน่งว่าง - สแปร์ประจำ 3]', isSpare: true,
        rawShifts: "D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D" },
      { no: 40, position: 'Spare Relief Pool (โควตาสแปร์หมุนเวียน)', code: 'SPARE-RELIEF', name: 'รปภ. สแปร์หมุนเวียนตามสัญญา', isSpare: true, isReliefPool: true,
        rawShifts: "H,H,D,N,H,H,D,H,H,D,D,H,H,N,H,H,D,N,H,H,D,H,H,D,D,H,H,N,H,H" }
    ];

    // 2. NOVEMBER 2026 EXACT DRAFT DATA (31 days from 23 Oct to 22 Nov)
    const novMasterData = [
      { no: 1, position: 'Site manager', code: 'SE2403575', name: 'นายอัครเดช เจริญสุข', isSpare: false,
        rawShifts: "D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H" },
      { no: 2, position: 'Security Fire Man 1', code: 'SE2402366', name: 'น.ส.ปณิตา โอละลึก', isSpare: false, isFireman: true, firemanId: 1,
        rawShifts: "H,H,D,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H" },
      { no: 3, position: 'Security Fire Man 2', code: 'SE2601481', name: 'น.ส.พรธิตา ศรีกุลวงษ์', isSpare: false, isFireman: true, firemanId: 2,
        rawShifts: "D,H,H,D,D,D,D,H,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H" },
      { no: 4, position: 'Security Fire Man 4', code: 'SE2604787', name: 'นายจิรโชติ ธงชัย', isSpare: false, isFireman: true, firemanId: 4,
        rawShifts: "D,D,H,H,D,D,D,D,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D" },
      { no: 5, position: 'Security Fire Man 3', code: 'SE2303758', name: 'นายสมชาย ทุสุนา', isSpare: false, isFireman: true, firemanId: 3,
        rawShifts: "D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D" },
      { no: 6, position: 'Senior Supervisor', code: 'SE2400110', name: 'นายอุสมาน แลยะลี', isSpare: false,
        rawShifts: "H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D" },
      { no: 7, position: 'Supervisor', code: 'SE2303757', name: 'นายอนุสรณ์ ศิริวัฒนกุล', isSpare: false,
        rawShifts: "H,D,D,D,D,D,H,H,D,N,N,N,N,H,H,D,D,D,D,D,H,H,D,N,N,N,N,H,H,D,D" },
      { no: 8, position: 'Supervisor', code: 'SE2500652', name: 'นายปิยวัฒน์ บุญเฮง', isSpare: false,
        rawShifts: "N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N" },
      { no: 9, position: 'Supervisor', code: 'SE2400890', name: 'นายธีรวัฒน์ ศรีนนท์เคน', isSpare: false,
        rawShifts: "D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H" },
      { no: 10, position: 'Ass. Supervisor', code: 'SE2400595', name: 'นายจักรพงษ์ ตระกูลดี', isSpare: false,
        rawShifts: "D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H" },
      { no: 11, position: 'Ass. Supervisor', code: 'SE2400593', name: 'นายพรชัย ใจตรง', isSpare: false,
        rawShifts: "N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N" },
      { no: 12, position: 'Ass. Supervisor', code: 'SE2504781', name: 'นายเสกสรร เสนนอก', isSpare: false,
        rawShifts: "D,D,D,D,D,H,H,D,N,N,N,N,H,H,D,D,D,D,D,H,H,D,N,N,N,N,H,H,D,D,D" },
      { no: 13, position: 'CCTV', code: 'SE2401588', name: 'นายรัชชานนท์ พรมวงค์', isSpare: false,
        rawShifts: "N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H" },
      { no: 14, position: 'CCTV', code: 'SE2501019', name: 'น.ส. สุภาวดี หมายจันทึก', isSpare: false,
        rawShifts: "N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N" },
      { no: 15, position: 'CCTV', code: 'SE2501861', name: 'น.ส.นัทธมน เสนานิคม', isSpare: false,
        rawShifts: "D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D" },
      { no: 16, position: 'Emergency Driver', code: 'SE2402957', name: 'นายณัฏฐสิทธิ์ มงคลดี', isSpare: false,
        rawShifts: "N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H" },
      { no: 17, position: 'Emergency Driver', code: 'SE2303770', name: 'นายอดิสรณ์ ขาวงาม', isSpare: false,
        rawShifts: "H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N" },
      { no: 18, position: 'Emergency Driver', code: 'SE2500083', name: 'นายเรืองฤทธิ์ คำผง', isSpare: false,
        rawShifts: "D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D" },
      { no: 19, position: 'Admin Day - Gate 1', code: 'SE2303764', name: 'น.ส.วิเชียร แมดพิมาย', isSpare: false,
        rawShifts: "D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H" },
      { no: 20, position: 'Admin Day - Gate 2', code: 'SE2500239', name: 'น.ส. อรนุช สายปัญญา', isSpare: false,
        rawShifts: "H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D" },
      { no: 21, position: 'Guard', code: 'SE2500384', name: 'น.ส. ปทุมพร ขวัญมา', isSpare: false,
        rawShifts: "D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D" },
      { no: 22, position: 'Guard', code: 'SE172615', name: 'นายประเสริฐ มูลฤทธิ์', isSpare: false,
        rawShifts: "N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N" },
      { no: 23, position: 'Guard', code: 'SE2503274', name: 'นายวัลลภ พิรักษา', isSpare: false,
        rawShifts: "N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N" },
      { no: 24, position: 'Guard', code: 'SE2504780', name: 'นายจุลชาติ แถลงกัณฑ์', isSpare: false,
        rawShifts: "H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N" },
      { no: 25, position: 'Guard', code: 'SE2401151', name: 'นายสินณรงค์กร ทองเกษร', isSpare: false,
        rawShifts: "D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H" },
      { no: 26, position: 'Guard', code: 'SE2303133', name: 'นายดำรงพร วงศ์สมบัติ', isSpare: false,
        rawShifts: "D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H" },
      { no: 27, position: 'Guard', code: 'SE2602602', name: 'นายสุทธิพงษ์ ปัญญาพรม', isSpare: false,
        rawShifts: "D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D" },
      { no: 28, position: 'Guard', code: 'SE2501573', name: 'นายสรยุทธ หอมสมบัติ', isSpare: false,
        rawShifts: "D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D" },
      { no: 29, position: 'Guard', code: 'SE2605554', name: 'นายวันชัย ช่วยปัด', isSpare: false,
        rawShifts: "D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D" },
      { no: 30, position: 'Guard', code: 'SE2503503', name: 'นายถาวร ไชยโคตร', isSpare: false,
        rawShifts: "H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D" },
      { no: 31, position: 'Guard (SE2504018)', code: 'SE2504018', name: 'นายพิชิต บุญชู', isSpare: false,
        rawShifts: "N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H" },
      { no: 32, position: 'Guard', code: 'SE2402657', name: 'นายอดิเทพ อุระเพ็ญ', isSpare: false,
        rawShifts: "N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N" },
      { no: 33, position: 'Guard', code: 'SE2403015', name: 'นายพรชัย จิตรสม', isSpare: false,
        rawShifts: "H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D" },
      { no: 34, position: 'Guard', code: 'SE2500612', name: 'นายสุรศักดิ์  อักษรพิมพ์', isSpare: false,
        rawShifts: "H,D,D,N,N,N,H,H,D,D,D,N,N,H,H,D,D,N,N,N,H,H,D,D,D,N,N,H,H,D,D" },
      { no: 35, position: 'Guard', code: 'SE2603922', name: 'นายภานุวัฒน์ ใบบัวดง', isSpare: false,
        rawShifts: "H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D" },
      { no: 36, position: 'Guard (SE2604192)', code: 'SE2604192', name: 'นายณรงค์ จำปา', isSpare: false,
        rawShifts: "N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N" },
      { no: 37, position: 'Guard', code: 'SE2603850', name: 'นายอานนท์ สาริกุล', isSpare: false,
        rawShifts: "D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H,H,N,N,N,N,N,H,H,D,D,D,D,D,H" },
      { no: 38, position: 'Reception Staff', code: 'SE2303772', name: 'น.ส.ปรียมน วสะหลาย', isSpare: false,
        rawShifts: "D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H" },
      { no: 39, position: 'Reception Staff (สแปร์)', code: '', name: '[ตำแหน่งว่าง - สแปร์ประจำ 3]', isSpare: true,
        rawShifts: "D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H,D,D,D,D,D,H,H" },
      { no: 40, position: 'Spare Relief Pool (โควตาสแปร์หมุนเวียน)', code: 'SPARE-RELIEF', name: 'รปภ. สแปร์หมุนเวียนตามสัญญา', isSpare: true, isReliefPool: true,
        rawShifts: "H,H,N,H,H,D,N,H,H,D,H,H,D,D,H,H,N,H,H,D,N,H,H,D,H,H,D,D,H,H,N" }
    ];

    // Fireman Rotation Helper
    function getFiremanShiftPattern(firemanId, monthOffset) {
      if (firemanId === 3) {
        return decMasterData[4].rawShifts.split(','); // นายสมชาย ทุสุนา Fixed
      }
      const patterns = [
        decMasterData[2].rawShifts.split(','), // Fireman 2: Fri-Sat
        decMasterData[1].rawShifts.split(','), // Fireman 1: Sun-Mon
        decMasterData[3].rawShifts.split(',')  // Fireman 4: Sat-Sun
      ];
      let base = 0;
      if (firemanId === 2) base = 0;
      if (firemanId === 1) base = 1;
      if (firemanId === 4) base = 2;
      return patterns[(base + monthOffset) % 3];
    }

    // Schedule Grid Data State
    const scheduleData = ref([]);
    const replacementLogs = ref([]);

    function initSchedule() {
      // Clear old broken cache keys automatically
      localStorage.removeItem('schedule_cycle_0');
      localStorage.removeItem('schedule_cycle_1');

      const cycle = currentCycle.value;
      const storageKey = `security_work_schedule_cycle_${cycle.id}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        scheduleData.value = JSON.parse(saved);
        return;
      }

      const daysCount = currentCycleDays.value.length;
      const masterSource = (cycle.id === 'nov') ? novMasterData : decMasterData;
      const monthOffset = cycle.monthOffset;

      scheduleData.value = masterSource.map(g => {
        let basePattern = [];
        if (g.isFireman && cycle.id !== 'nov') {
          basePattern = getFiremanShiftPattern(g.firemanId, monthOffset);
        } else {
          basePattern = g.rawShifts.split(',');
        }

        const shifts = [];
        for (let d = 0; d < daysCount; d++) {
          shifts.push(basePattern[d % basePattern.length]);
        }

        return {
          id: g.no,
          no: g.no,
          position: g.position,
          code: g.code,
          name: g.name,
          isSpare: g.isSpare,
          isReliefPool: g.isReliefPool || false,
          replacementName: null,
          replacementType: null,
          shifts
        };
      });

      saveSchedule();
    }

    function saveSchedule() {
      const cycle = currentCycle.value;
      const storageKey = `security_work_schedule_cycle_${cycle.id}`;
      localStorage.setItem(storageKey, JSON.stringify(scheduleData.value));
    }

    // Daily Contract Goals:
    // Mon-Fri: D=19, N=10 | Sat: D=17, N=10 | Sun: D=16, N=10
    function getDailyContract(dateObj, shiftType) {
      if (shiftType === 'N') return 10;
      const day = dateObj.getDay();
      if (day === 0) return 16; // Sunday: reduce Reception 2, Site Mgr 1
      if (day === 6) return 17; // Saturday: reduce Reception 2
      return 19; // Weekday
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
      return totalWork <= 22;
    }

    function isWeekend(dateObj) {
      const d = dateObj.getDay();
      return d === 0 || d === 6;
    }

    function getShiftStyle(shift) {
      switch (shift) {
        case 'D': return 'bg-amber-100/90 text-amber-900 border-amber-200';
        case 'N': return 'bg-indigo-100/90 text-indigo-900 border-indigo-200';
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
      replaceType: 'สแปร์นอก',
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
      return replacementLogs.value.length + (scheduleData.value.filter(g => g.isSpare && !g.isReliefPool).length * 22);
    });

    const billingSpareLog = computed(() => {
      if (replacementLogs.value.length > 0) return replacementLogs.value;
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

    function autoGenerateNextCycle() {
      if (confirm('คุณต้องการรันตารางเวรในรอบถัดไปอัตโนมัติหรือไม่?\n(ระบบจะหมุนกะ Fireman ให้อัตโนมัติ)')) {
        selectedCycleIndex.value = (selectedCycleIndex.value + 1) % payrollCycles.value.length;
        initSchedule();
        alert(`🎉 รันตารางเวรรอบ ${currentCycle.value.name} สำเร็จเรียบร้อยแล้ว!`);
      }
    }

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

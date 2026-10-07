// HR seed: 18 employees, the default KPI templates, two appraisal cycles with
// their appraisals, leave requests, three months of attendance and three
// settlements at different stages. Employment, separation and cycle dates are
// absolute so the on-screen Jahangir statement reproduces spec I.1 to the
// paisa; attendance months, leave requests, createdAt/updatedAt and the open
// cycle's due dates are relative to today (A.2 #7). Every score and statement
// comes from the helpers (computeAppraisalScore / computeSettlement), never
// from hand-typed numbers.
import { APPRAISAL_STATUS, CLEARANCE_STATUS, CYCLE_STATUS, DEFAULT_HR_SETTINGS, DEFAULT_KPI_TEMPLATES, DEFAULT_LEAVE_TYPES, EMPLOYEE_DOC_TYPES, EMPLOYEE_STATUS, HR_SYSTEM, HR_USERS, LEAVE_STATUS, SEPARATION_DOC_TYPES, SETTLEMENT_STATUS, designationOf } from './config.js';
import { approvedLeaveDaysInMonth, attendanceKpi, buildAppraisal, computeAppraisalScore, countLeaveDays, defaultClearance, emptyAttendance, emptyDisciplinary, emptyEmployee, emptyLeaveRequest, emptySettlement, fmtMoney2, freezeStatement, lastMonths, localToday, lwpDaysInMonth, migrateEmployee, monthKey, num, periodMonths, recommendationFor, round2, settlementInputsFrom, templateFor } from './helpers.js';
import { addDays, addMonths, uid } from '../utils/helpers.js';

const t = localToday();
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const by = 'Farhana Rahman';
const HEAD = 'Sabbir Hossain';
const S = DEFAULT_HR_SETTINGS;
const A = APPRAISAL_STATUS;
const E = EMPLOYEE_STATUS;
const ST = SETTLEMENT_STATUS;
const rel = (n) => addDays(t, n);
// 'YYYY-MM-DD' or 'YYYY-MM-DDTHH' → ISO timestamp (09:00 UTC unless an hour is given).
const at = (d) => (d.includes('T') ? `${d}:00:00.000Z` : `${d}T09:00:00.000Z`);
// Seed actions are attributed to signed-in users only (A.2 #4): the HR Officer acts on behalf of
// employees who are not users and the HR Head on behalf of managers who are not users (K.3).
const userOf = (empId) => HR_USERS.find((u) => u.employeeId === empId)?.name || '';
const asEmployee = (empId) => userOf(empId) || by;
const asManager = (empId) => userOf(empId) || HEAD;

const doc = (type, { expiry = '', version = 1, current = true, uploadedBy = by, ago = 10, fileName, verified = false, verifiedBy = '', note = '' } = {}) => ({
  id: uid('doc'), type, fileName: fileName || `${type.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_v${version}.pdf`, issuedOn: '', expiry, version, current,
  uploadedBy, uploadedAt: daysAgo(ago), verified, verifiedBy, verifiedAt: verified ? daysAgo(ago - 2) : '', note,
});
// NID (verified), photograph, appointment letter and educational certificate on every activated record.
const docs = (ago, extra = []) => [
  doc(EMPLOYEE_DOC_TYPES.NID, { ago, verified: true, verifiedBy: by }),
  doc(EMPLOYEE_DOC_TYPES.PHOTO, { ago, fileName: 'photo.jpg' }),
  doc(EMPLOYEE_DOC_TYPES.APPOINTMENT, { ago }),
  doc(EMPLOYEE_DOC_TYPES.EDU, { ago }),
  ...extra,
];

const make = (o) => migrateEmployee({ ...emptyEmployee(by), ...o });
const sal = (basic, houseRent, medical, conveyance, otherAllowances, dearness = 0) =>
  ({ basic: String(basic), houseRent: String(houseRent), medical: String(medical), conveyance: String(conveyance), dearness: String(dearness), adhoc: '', otherAllowances: String(otherAllowances), effectiveFrom: '2026-01-01', payMode: 'Bank Transfer', history: [] });
const bank = (bankName, branch, accountName, accountNo, accountType = 'Savings') =>
  ({ bankName, branch, accountType, accountName, accountNo, routingNo: '', verified: true, verifiedBy: by, verifiedAt: daysAgo(40) });
const pf = (joinDate, own, employer, interest, advance = 0, rate = '8') =>
  ({ member: true, joinDate, employeeRatePct: rate, employerRatePct: rate, ownBalance: String(own), employerBalance: String(employer), interestAccrued: String(interest), advanceOutstanding: String(advance) });
// Next of kin doubles as emergency contact and PF nominee.
const kin = (name, relation, mobile, nid, address) => ({ emergencyContact: { name, relation, mobile, address }, nominee: { name, relation, nid, mobile, sharePct: '100' } });
// Employment block from the designation defaults; probation end = join + designation months, confirmation on that date.
const employment = (designation, joinDate, reportingManagerId, { workLocation = 'Dhaka HQ', establishmentType = 'commercial', confirmed = true, activated = true } = {}) => {
  const d = designationOf(designation);
  const endDate = activated && d.probationMonths ? addMonths(joinDate, d.probationMonths) : '';
  const decided = confirmed && !!endDate;
  return {
    department: d.department, designation, grade: d.grade, employmentType: 'Permanent', workerCategory: d.workerCategory, wageBasis: 'Monthly', establishmentType,
    joinDate, contractEndDate: '', confirmationDate: confirmed ? endDate || joinDate : '', reportingManagerId, workLocation,
    probation: { required: d.probationMonths > 0, months: String(d.probationMonths || 6), endDate, extended: false, extendedTo: '', decision: decided ? 'Confirm' : '', decidedAt: decided ? at(endDate) : '', decidedBy: decided ? HEAD : '' },
  };
};
// Status trail: Draft at record creation, then [status, date, by, reason] steps.
const trail = (createdAt, steps) => [
  { status: E.DRAFT, at: createdAt, by, reason: 'Record created' },
  ...steps.map(([status, date, who = by, reason = '']) => ({ status, at: at(date), by: who, reason })),
];
const confirmedTrail = (createdAt, joinDate, confirmationDate, more = []) => trail(createdAt, [[E.PROBATION, joinDate, by, 'Joined'], [E.CONFIRMED, confirmationDate, HEAD, 'Probation confirmed'], ...more]);

// ---------------------------------------------------------------------------
// H.1 Employees

const buildEmployees = () => [
  make({
    id: 'emp_anisur', code: 'EMP-1001', status: E.CONFIRMED, name: 'Anisur Rahman', fatherName: 'Late Mofizur Rahman', motherName: 'Rokeya Begum', dob: '1968-03-15', gender: 'Male', maritalStatus: 'Married', bloodGroup: 'B+',
    nid: '1968123456701', tin: '102030401001', mobile: '01711000001', altMobile: '', email: 'anisur.rahman@padmaci.example', presentAddress: 'House 18, Road 104, Gulshan 2, Dhaka 1212', permanentAddress: 'Vill. Kalikapur, Munshiganj Sadar, Munshiganj',
    ...kin('Shirin Rahman', 'Spouse', '01711000101', '1970123456702', 'House 18, Road 104, Gulshan 2, Dhaka 1212'),
    employment: employment('MD', '2014-01-01', ''),
    salary: sal(250000, 100000, 15000, 15000, 20000), bank: bank('Eastern Bank', 'Gulshan', 'Anisur Rahman', '1011234500001'), pf: pf('2014-01-01', 2400000, 2400000, 700000, 0, '10'),
    statusHistory: trail(daysAgo(420), [[E.CONFIRMED, '2014-01-01', by, 'Joined as Managing Director']]),
    documents: docs(400), createdAt: daysAgo(420), updatedAt: daysAgo(60),
  }),
  make({
    id: 'emp_sabbir', code: 'EMP-1002', status: E.CONFIRMED, name: 'Sabbir Hossain', fatherName: 'Abul Hossain', motherName: 'Nargis Akter', dob: '1979-07-22', gender: 'Male', maritalStatus: 'Married', bloodGroup: 'O+',
    nid: '1979123456702', tin: '102030401002', mobile: '01711000002', email: 'sabbir.hossain@padmaci.example', presentAddress: 'Flat B4, House 22, Road 7, Banani, Dhaka 1213', permanentAddress: 'Vill. Charpara, Mymensingh Sadar, Mymensingh',
    passportNo: 'A01234567', passportExpiry: rel(400),
    ...kin('Farzana Hossain', 'Spouse', '01711000102', '1982123456703', 'Flat B4, House 22, Road 7, Banani, Dhaka 1213'),
    employment: employment('HOH', '2016-04-01', 'emp_anisur'),
    salary: sal(90000, 45000, 7500, 10000, 7500), bank: bank('BRAC Bank', 'Gulshan', 'Sabbir Hossain', '1501234500002'), pf: pf('2016-04-01', 980000, 980000, 310000, 0, '10'),
    statusHistory: confirmedTrail(daysAgo(418), '2016-04-01', '2016-10-01'),
    documents: docs(400, [doc(EMPLOYEE_DOC_TYPES.PASSPORT, { expiry: rel(400), ago: 300, verified: true, verifiedBy: by })]), createdAt: daysAgo(418), updatedAt: daysAgo(45),
  }),
  make({
    id: 'emp_nusrat', code: 'EMP-1003', status: E.CONFIRMED, name: 'Nusrat Jahan', fatherName: 'Mohammad Ali', motherName: 'Hasina Begum', dob: '1982-11-09', gender: 'Female', maritalStatus: 'Married', bloodGroup: 'A+',
    nid: '1982123456703', tin: '102030401003', mobile: '01811000003', email: 'nusrat.jahan@padmaci.example', presentAddress: 'House 5, Road 2, Block C, Bashundhara R/A, Dhaka 1229', permanentAddress: 'Vill. Raipur, Cumilla Sadar, Cumilla',
    passportNo: 'A07654321', passportExpiry: rel(40),
    ...kin('Tanvir Ahmed', 'Spouse', '01811000103', '1980123456704', 'House 5, Road 2, Block C, Bashundhara R/A, Dhaka 1229'),
    employment: employment('HOS', '2017-03-01', 'emp_anisur'),
    salary: sal(110000, 55000, 10000, 10000, 15000), bank: bank('City Bank', 'Motijheel', 'Nusrat Jahan', '3101234500003'), pf: pf('2017-03-01', 900000, 900000, 280000),
    statusHistory: confirmedTrail(daysAgo(416), '2017-03-01', '2017-09-01'),
    documents: docs(400, [doc(EMPLOYEE_DOC_TYPES.PASSPORT, { expiry: rel(40), ago: 380, verified: true, verifiedBy: by })]), createdAt: daysAgo(416), updatedAt: daysAgo(30),
  }),
  make({
    id: 'emp_mizan', code: 'EMP-1004', status: E.CONFIRMED, name: 'Mizanur Rahman', fatherName: 'Abdur Rahman', motherName: 'Jahanara Begum', dob: '1977-02-03', gender: 'Male', maritalStatus: 'Married', bloodGroup: 'AB+',
    nid: '1977123456704', tin: '102030401004', mobile: '01711000004', email: 'mizanur.rahman@padmaci.example', presentAddress: 'Holding 44, Chashara, Narayanganj 1400', permanentAddress: 'Vill. Baidyer Bazar, Sonargaon, Narayanganj',
    ...kin('Rubina Rahman', 'Spouse', '01711000104', '1980123456705', 'Holding 44, Chashara, Narayanganj 1400'),
    employment: employment('PM', '2015-06-15', 'emp_anisur', { workLocation: 'Narayanganj Factory', establishmentType: 'factory' }),
    salary: sal(100000, 50000, 8000, 10000, 12000), bank: bank('Dutch-Bangla Bank', 'Narayanganj', 'Mizanur Rahman', '2041234500004'), pf: pf('2015-06-15', 1100000, 1100000, 350000),
    statusHistory: confirmedTrail(daysAgo(415), '2015-06-15', '2015-12-15'),
    documents: docs(400), createdAt: daysAgo(415), updatedAt: daysAgo(50),
  }),
  make({
    id: 'emp_tahmina', code: 'EMP-1005', status: E.CONFIRMED, name: 'Tahmina Akter', fatherName: 'Shamsul Haque', motherName: 'Monowara Begum', dob: '1984-05-30', gender: 'Female', maritalStatus: 'Married', bloodGroup: 'O-',
    nid: '1984123456705', tin: '102030401005', mobile: '01911000005', email: 'tahmina.akter@padmaci.example', presentAddress: 'Flat 6A, House 9, Road 3, Dhanmondi, Dhaka 1205', permanentAddress: 'Vill. Kotwali, Jashore Sadar, Jashore',
    ...kin('Mahbub Alam', 'Spouse', '01911000105', '1982123456706', 'Flat 6A, House 9, Road 3, Dhanmondi, Dhaka 1205'),
    employment: employment('HOF', '2019-01-10', 'emp_anisur'),
    salary: sal(95000, 47500, 7500, 10000, 10000), bank: bank('Prime Bank', 'Motijheel', 'Tahmina Akter', '2131234500005'), pf: pf('2019-01-10', 560000, 560000, 120000),
    tax: { category: 'female_senior' },
    statusHistory: confirmedTrail(daysAgo(414), '2019-01-10', '2019-07-10'),
    documents: docs(400), createdAt: daysAgo(414), updatedAt: daysAgo(35),
  }),
  make({
    id: 'emp_kamrul', code: 'EMP-1006', status: E.CONFIRMED, name: 'Kamrul Islam', fatherName: 'Nurul Islam', motherName: 'Salma Khatun', dob: '1988-09-12', gender: 'Male', maritalStatus: 'Married', bloodGroup: 'B+',
    nid: '1988123456706', tin: '102030401006', mobile: '01711000006', email: 'kamrul.islam@padmaci.example', presentAddress: 'House 31, Section 10, Mirpur, Dhaka 1216', permanentAddress: 'Vill. Sadullapur, Gaibandha',
    ...kin('Sadia Islam', 'Spouse', '01711000106', '1991123456707', 'House 31, Section 10, Mirpur, Dhaka 1216'),
    employment: employment('ASM', '2020-02-01', 'emp_nusrat'),
    salary: sal(50000, 25000, 4000, 6000, 5000), bank: bank('BRAC Bank', 'Mirpur', 'Kamrul Islam', '1501234500006'), pf: pf('2020-02-01', 230000, 230000, 40000),
    leave: { opening: { EL: '12' } },
    statusHistory: confirmedTrail(daysAgo(412), '2020-02-01', '2020-08-01'),
    documents: docs(400), createdAt: daysAgo(412), updatedAt: daysAgo(20),
  }),
  make({
    id: 'emp_shimul', code: 'EMP-1007', status: E.CONFIRMED, name: 'Shimul Barua', fatherName: 'Sujit Barua', motherName: 'Rina Barua', dob: '1990-01-25', gender: 'Male', maritalStatus: 'Married', bloodGroup: 'A-',
    nid: '1990123456707', tin: '102030401007', mobile: '01811000007', email: 'shimul.barua@padmaci.example', presentAddress: 'Holding 12, Nitaiganj, Narayanganj 1400', permanentAddress: 'Vill. Raozan, Chattogram',
    ...kin('Sujit Barua', 'Father', '01811000107', '1960123456708', 'Vill. Raozan, Chattogram'),
    employment: employment('PS', '2018-11-12', 'emp_mizan', { workLocation: 'Narayanganj Factory', establishmentType: 'factory' }),
    salary: sal(30000, 15000, 2500, 2500, 2000), bank: bank('Islami Bank Bangladesh', 'Narayanganj', 'Shimul Barua', '2051234500007'), pf: pf('2018-11-12', 180000, 180000, 30000),
    leave: { opening: { EL: '9' } },
    statusHistory: confirmedTrail(daysAgo(410), '2018-11-12', '2019-02-12'),
    documents: docs(400), createdAt: daysAgo(410), updatedAt: daysAgo(25),
  }),
  make({
    id: 'emp_hasan', code: 'EMP-1008', status: E.CONFIRMED, name: 'Hasan Mahmud', fatherName: 'Abdul Mannan', motherName: 'Rahima Khatun', dob: '1986-12-01', gender: 'Male', maritalStatus: 'Married', bloodGroup: 'O+',
    nid: '8612345678', tin: '', mobile: '01711000008', email: '', presentAddress: 'Vill. Bhawal Mirzapur, Gazipur Sadar, Gazipur 1700', permanentAddress: 'Vill. Bhawal Mirzapur, Gazipur Sadar, Gazipur 1700',
    ...kin('Rahima Khatun', 'Mother', '01711000108', '6012345678', 'Vill. Bhawal Mirzapur, Gazipur Sadar, Gazipur 1700'),
    employment: employment('DRV', '2019-03-04', 'emp_sabbir'),
    salary: sal(16000, 8000, 1500, 1500, 1000), bank: bank('Dutch-Bangla Bank', 'Mirpur', 'Hasan Mahmud', '2041234500008'), pf: pf('2019-03-04', 95000, 95000, 14000),
    disciplinary: [{ ...emptyDisciplinary(HEAD), id: 'dis_hasan_2026_03', type: 'Written Warning', date: '2026-03-10', reference: 'HR/WL/2026-03', showCauseDate: '2026-03-02', replyDueDate: '2026-03-06', outcome: 'Warning issued', note: 'Unauthorised vehicle use', at: at('2026-03-10') }],
    statusHistory: confirmedTrail(daysAgo(408), '2019-03-04', '2019-06-04'),
    documents: docs(400, [doc(EMPLOYEE_DOC_TYPES.LICENCE, { expiry: rel(20), ago: 390, verified: true, verifiedBy: by, fileName: 'driving_licence.pdf' })]), createdAt: daysAgo(408), updatedAt: daysAgo(15),
  }),
  make({
    id: 'emp_jahangir', code: 'EMP-1009', status: E.NOTICE, statusReason: 'Resignation accepted', name: 'Jahangir Alam', fatherName: 'Shamsul Alam', motherName: 'Fatema Begum', dob: '1990-05-12', gender: 'Male', maritalStatus: 'Married', bloodGroup: 'B-',
    nid: '1990123456709', tin: '102030401009', mobile: '01811000009', email: 'jahangir.alam@padmaci.example', presentAddress: 'Flat 3B, 27 Agrabad C/A, Chattogram 4100', permanentAddress: 'Vill. Patiya, Chattogram',
    ...kin('Nasrin Alam', 'Spouse', '01811000109', '1992123456710', 'Flat 3B, 27 Agrabad C/A, Chattogram 4100'),
    employment: employment('SO', '2019-02-20', 'emp_kamrul', { workLocation: 'Chattogram Office' }),
    salary: sal(40000, 15000, 2000, 2000, 1000), bank: bank('BRAC Bank', 'Agrabad', 'Jahangir Alam', '1501234500009'), pf: pf('2019-02-20', 300000, 300000, 120000, 40000, '10'),
    loans: [{ id: 'loan_jahangir_adv', type: 'Salary Advance', principal: '20000', outstanding: '10000', monthlyInstalment: '5000', note: 'Advance taken in June for family medical expenses' }],
    tax: { category: 'general', ytdIncome: '180000', ytdTaxPaid: '0', bonusPaidThisYear: false },
    leave: { opening: { EL: '0' } },
    separationId: 'stl_jahangir',
    statusHistory: confirmedTrail(daysAgo(406), '2019-02-20', '2019-08-20', [[E.NOTICE, '2026-09-05', by, 'FS-1001: Resignation, LWD 2026-10-20']]),
    documents: docs(400), createdAt: daysAgo(406), updatedAt: daysAgo(31),
  }),
  make({
    id: 'emp_belal', code: 'EMP-1010', status: E.SEPARATED, name: 'Belal Ahmed', fatherName: 'Kalam Ahmed', motherName: 'Amena Begum', dob: '1995-02-01', gender: 'Male', maritalStatus: 'Single', bloodGroup: 'A+',
    nid: '9512345678', tin: '', mobile: '01711000010', email: '', presentAddress: 'Holding 8, Fatullah, Narayanganj 1421', permanentAddress: 'Vill. Araihazar, Narayanganj',
    ...kin('Kalam Ahmed', 'Father', '01711000110', '6512345678', 'Vill. Araihazar, Narayanganj'),
    employment: employment('MO', '2021-01-11', 'emp_shimul', { workLocation: 'Narayanganj Factory', establishmentType: 'factory' }),
    salary: sal(15000, 7500, 1500, 1500, 1000), bank: bank('Eastern Bank', 'Narayanganj', 'Belal Ahmed', '1011234500010'), pf: pf('2021-01-11', 60000, 60000, 9000),
    tax: { category: 'general', ytdIncome: '0', ytdTaxPaid: '0', bonusPaidThisYear: false },
    separationId: 'stl_belal', separatedAt: '2026-07-31', rehireEligible: true,
    statusHistory: confirmedTrail(daysAgo(404), '2021-01-11', '2021-04-11', [[E.NOTICE, '2026-07-31', by, 'FS-1003: Termination, LWD 2026-07-31'], [E.SEPARATED, '2026-08-04', by, 'Exit completed']]),
    documents: docs(400), createdAt: daysAgo(404), updatedAt: daysAgo(40),
  }),
  make({
    id: 'emp_moushumi', code: 'EMP-1011', status: E.SEPARATED, name: 'Moushumi Das', fatherName: 'Pradip Das', motherName: 'Shikha Das', dob: '1996-11-03', gender: 'Female', maritalStatus: 'Single', bloodGroup: 'O+',
    nid: '1996123456711', tin: '102030401011', mobile: '01911000011', email: 'moushumi.das@padmaci.example', presentAddress: 'House 14, Lalbagh Road, Dhaka 1211', permanentAddress: 'Vill. Kalkini, Madaripur',
    ...kin('Pradip Das', 'Father', '01911000111', '1966123456712', 'Vill. Kalkini, Madaripur'),
    employment: employment('AE', '2022-03-01', 'emp_tahmina'),
    salary: sal(30000, 15000, 2500, 3000, 2500), bank: bank('City Bank', 'Motijheel', 'Moushumi Das', '3101234500011'), pf: pf('2022-03-01', 110000, 110000, 18000),
    tax: { category: 'general', ytdIncome: '53000', ytdTaxPaid: '0', bonusPaidThisYear: false },
    separationId: 'stl_moushumi', separatedAt: '2026-08-31',
    statusHistory: confirmedTrail(daysAgo(402), '2022-03-01', '2022-09-01', [[E.NOTICE, '2026-07-02', by, 'FS-1002: Resignation, LWD 2026-08-31'], [E.SEPARATED, '2026-09-03', by, 'Exit completed']]),
    documents: docs(400), createdAt: daysAgo(402), updatedAt: daysAgo(33),
  }),
  make({
    id: 'emp_jahid', code: 'EMP-1012', status: E.CONFIRMED, name: 'Jahid Hossain', fatherName: 'Delwar Hossain', motherName: 'Parvin Akter', dob: '1993-04-18', gender: 'Male', maritalStatus: 'Married', bloodGroup: 'B+',
    nid: '1993123456712', tin: '102030401012', mobile: '01711000012', email: 'jahid.hossain@padmaci.example', presentAddress: 'House 21, Kandirpar, Cumilla 3500', permanentAddress: 'Vill. Burichang, Cumilla',
    ...kin('Sharmin Akter', 'Spouse', '01711000112', '1995123456713', 'House 21, Kandirpar, Cumilla 3500'),
    employment: employment('PO', '2021-09-01', 'emp_mizan', { workLocation: 'Cumilla Depot' }),
    salary: sal(32000, 16000, 2500, 3000, 2500), bank: bank('Mutual Trust Bank', 'Narayanganj', 'Jahid Hossain', '0021234500012'), pf: pf('2021-09-01', 120000, 120000, 19000),
    leave: { opening: { EL: '4' } },
    statusHistory: confirmedTrail(daysAgo(400), '2021-09-01', '2022-03-01'),
    documents: docs(380), createdAt: daysAgo(400), updatedAt: daysAgo(48),
  }),
  make({
    id: 'emp_farhana', code: 'EMP-1013', status: E.CONFIRMED, name: 'Farhana Rahman', fatherName: 'Mizanur Rahman', motherName: 'Nasima Begum', dob: '1994-08-08', gender: 'Female', maritalStatus: 'Married', bloodGroup: 'A+',
    nid: '1994123456713', tin: '102030401013', mobile: '01711000013', email: 'farhana.rahman@padmaci.example', presentAddress: 'Flat 2C, House 11, Road 12, Uttara Sector 3, Dhaka 1230', permanentAddress: 'Vill. Sreepur, Gazipur',
    ...kin('Rafsan Chowdhury', 'Spouse', '01711000113', '1992123456714', 'Flat 2C, House 11, Road 12, Uttara Sector 3, Dhaka 1230'),
    employment: employment('HRO', '2022-01-17', 'emp_sabbir'),
    salary: sal(30000, 15000, 2500, 3000, 2500), bank: bank('Prime Bank', 'Gulshan', 'Farhana Rahman', '2131234500013'), pf: pf('2022-01-17', 110000, 110000, 17000),
    leave: { opening: { EL: '5' } },
    statusHistory: confirmedTrail(daysAgo(398), '2022-01-17', '2022-07-17'),
    documents: docs(380), createdAt: daysAgo(398), updatedAt: daysAgo(57),
  }),
  make({
    id: 'emp_rakib', code: 'EMP-1014', status: E.CONFIRMED, name: 'Rakib Hasan', fatherName: 'Rafiqul Hasan', motherName: 'Shamima Akter', dob: '1997-06-14', gender: 'Male', maritalStatus: 'Single', bloodGroup: 'O+',
    nid: '1997123456714', tin: '102030401014', mobile: '01711000014', email: 'rakib.hasan@padmaci.example', presentAddress: 'House 7, Block D, Mirpur 12, Dhaka 1216', permanentAddress: 'Vill. Kalihati, Tangail',
    ...kin('Rafiqul Hasan', 'Father', '01711000114', '1965123456715', 'Vill. Kalihati, Tangail'),
    employment: employment('SO', '2023-04-03', 'emp_kamrul'),
    salary: sal(25000, 12500, 2500, 3000, 2000), bank: bank('BRAC Bank', 'Mirpur', 'Rakib Hasan', '1501234500014'), pf: pf('2023-04-03', 60000, 60000, 7000),
    leave: { opening: { EL: '6' } },
    statusHistory: confirmedTrail(daysAgo(396), '2023-04-03', '2023-10-03'),
    documents: docs(380), createdAt: daysAgo(396), updatedAt: daysAgo(22),
  }),
  make({
    id: 'emp_rafiqul', code: 'EMP-1015', status: E.CONFIRMED, name: 'Rafiqul Islam', fatherName: 'Sirajul Islam', motherName: 'Hosne Ara', dob: '1995-10-21', gender: 'Male', maritalStatus: 'Single', bloodGroup: 'AB-',
    nid: '1995123456715', tin: '102030401015', mobile: '01811000015', email: 'rafiqul.islam@padmaci.example', presentAddress: 'House 40, Road 5, Mohammadpur, Dhaka 1207', permanentAddress: 'Vill. Ghior, Manikganj',
    ...kin('Sirajul Islam', 'Father', '01811000115', '1962123456716', 'Vill. Ghior, Manikganj'),
    employment: employment('ITO', '2024-07-01', 'emp_tahmina'),
    salary: sal(30000, 15000, 2500, 3000, 2500), bank: bank('Dutch-Bangla Bank', 'Gulshan', 'Rafiqul Islam', '2041234500015'), pf: pf('2024-07-01', 50000, 50000, 4000),
    statusHistory: confirmedTrail(daysAgo(394), '2024-07-01', '2025-01-01'),
    documents: docs(380), createdAt: daysAgo(394), updatedAt: daysAgo(70),
  }),
  make({
    id: 'emp_sumaiya', code: 'EMP-1016', status: E.PROBATION, name: 'Sumaiya Khatun', fatherName: 'Abdul Jalil', motherName: 'Rashida Khatun', dob: '2001-01-20', gender: 'Female', maritalStatus: 'Single', bloodGroup: 'B+',
    nid: '2001123456716', tin: '', mobile: '01911000016', email: 'sumaiya.khatun@padmaci.example', presentAddress: 'House 3, Road 9, Mirpur 1, Dhaka 1216', permanentAddress: 'Vill. Savar, Dhaka',
    ...kin('Abdul Jalil', 'Father', '01911000116', '1970123456717', 'Vill. Savar, Dhaka'),
    employment: employment('AE', '2026-05-04', 'emp_tahmina', { confirmed: false }),
    salary: sal(28000, 14000, 2500, 3000, 2500), bank: bank('City Bank', 'Motijheel', 'Sumaiya Khatun', '3101234500016'),
    statusHistory: trail(daysAgo(160), [[E.PROBATION, '2026-05-04', by, 'Joined']]),
    documents: docs(150), createdAt: daysAgo(160), updatedAt: daysAgo(10),
  }),
  make({
    id: 'emp_abdul', code: 'EMP-1017', status: E.PROBATION, name: 'Abdul Karim', fatherName: 'Abdul Hamid', motherName: 'Jamila Khatun', dob: '2000-03-05', gender: 'Male', maritalStatus: 'Single', bloodGroup: 'O+',
    nid: '0012345678', tin: '', mobile: '01711000017', email: '', presentAddress: 'Holding 19, Siddhirganj, Narayanganj 1430', permanentAddress: 'Vill. Rupganj, Narayanganj',
    ...kin('Abdul Hamid', 'Father', '01711000117', '7012345678', 'Vill. Rupganj, Narayanganj'),
    employment: employment('MO', '2026-08-18', 'emp_shimul', { workLocation: 'Narayanganj Factory', establishmentType: 'factory', confirmed: false }),
    salary: sal(14000, 7000, 1500, 1500, 1000), bank: bank('bKash', '', 'Abdul Karim', '01711000017', 'Mobile Wallet (bKash / Nagad / Rocket)'),
    statusHistory: trail(daysAgo(52), [[E.PROBATION, '2026-08-18', by, 'Joined']]),
    documents: docs(48), createdAt: daysAgo(52), updatedAt: daysAgo(12),
  }),
  make({
    id: 'emp_draft', code: '', status: E.DRAFT, name: 'Nabila Noor', fatherName: 'Nazmul Haque', motherName: 'Rehana Parvin', dob: '1999-09-09', gender: 'Female', maritalStatus: 'Single', bloodGroup: 'A+',
    nid: '1999123456718', tin: '', mobile: '01711000018', email: 'nabila.noor@padmaci.example', presentAddress: 'House 9, Road 4, Niketan, Dhaka 1212', permanentAddress: 'Vill. Bhairab, Kishoreganj',
    ...kin('Nazmul Haque', 'Father', '01711000118', '1968123456719', 'Vill. Bhairab, Kishoreganj'),
    employment: employment('HRO', rel(7), 'emp_sabbir', { confirmed: false, activated: false }),
    salary: sal(30000, 15000, 2500, 3000, 2500), bank: bank('Prime Bank', 'Gulshan', 'Nabila Noor', '2131234500018'),
    statusHistory: [], documents: [], createdAt: daysAgo(2), updatedAt: daysAgo(2),
  }),
];

// ---------------------------------------------------------------------------
// H.2 Cycles and appraisals

const buildCycles = () => {
  const open = rel(-97);
  return [
    {
      id: 'cyc_2025', code: 'CYC-2025', name: 'Annual Appraisal 2025', type: 'Annual', periodFrom: '2025-01-01', periodTo: '2025-12-31', status: CYCLE_STATUS.CLOSED,
      due: { kpi: '2025-01-31', self: '2026-01-10', manager: '2026-01-20', hr: '2026-02-07', publish: '2026-02-10', ack: '2026-02-17' }, payout: { incrementEffective: '2026-01-01', bonusPayable: true },
      openedAt: at('2025-01-05'), closedAt: at('2026-02-10T17'), createdBy: HEAD, createdAt: at('2024-12-20'), updatedAt: at('2026-02-10T17'),
    },
    {
      id: 'cyc_2026my', code: 'CYC-2026-MY', name: 'Mid-Year Review 2026', type: 'Half-yearly', periodFrom: '2026-01-01', periodTo: '2026-06-30', status: CYCLE_STATUS.OPEN,
      // Every due date has passed, so the open appraisals all raise overdue reminders.
      due: { kpi: rel(-93), self: rel(-88), manager: rel(-78), hr: rel(-67), publish: rel(-57), ack: rel(-50) }, payout: { incrementEffective: '', bonusPayable: false },
      openedAt: at(open), closedAt: '', createdBy: HEAD, createdAt: at(rel(-100)), updatedAt: at(open),
    },
  ];
};

// Attendance snapshot as applySystemActuals would lock it (score from the step tables).
const snapshot = (pct, avgLates, unapproved, months, lockedAt) =>
  ({ pct, avgLates, unapproved, months, score: attendanceKpi({ pct, avgLates, unapproved }, S).score, lockedAt });

// Fills actuals and ratings, then scores through computeAppraisalScore. `ach` scales every manual
// target (lower-is-better targets are divided), method C takes the rating and D counts as complete;
// attendance-sourced KPIs take the system score of the snapshot. `actuals` overrides by KPI code,
// `rating` is one number or one per competency, `hr` is an HR grade override (calibration).
const rated = (apr, emp, { ach = 0.95, rating = 4, hr = null, actuals = null, attendance = null } = {}) => {
  const snap = attendance || snapshot(97.5, 1.3, 0, periodMonths(apr.periodFrom, apr.periodTo).length, at(apr.periodTo));
  const ratingAt = (i) => String(Array.isArray(rating) ? rating[i] : rating);
  const actualOf = (k) => {
    if (actuals && actuals[k.code] != null) return actuals[k.code];
    if (k.source === 'attendance') return snap.score;
    if (k.method === 'C') return Array.isArray(rating) ? rating[0] : rating;
    if (k.method === 'D') return 1;
    return k.direction === 'lower' ? num(k.target) / ach : num(k.target) * ach;
  };
  const filled = {
    ...apr,
    attendance: snap,
    kpis: apr.kpis.map((k) => { const v = String(round2(actualOf(k))); return { ...k, actualSelf: v, selfComment: 'As per monthly reports', actualMgr: v, mgrComment: 'Verified against the MIS', evidence: 'MIS extract attached' }; }),
    competencies: apr.competencies.map((c, i) => ({ ...c, selfRating: ratingAt(i), mgrRating: ratingAt(i), mgrComment: '' })),
    self: { ...apr.self, overallComment: 'Delivered the agreed goals; see the KPI evidence for details.', achievements: 'Targets met on the main KPIs; supported colleagues during peak periods.' },
    hr: hr ? { ...apr.hr, gradeOverride: hr, calibrationNote: `Calibrated to ${hr} against the guided distribution` } : apr.hr,
  };
  const scored = computeAppraisalScore(filled, emp, S);
  const rec = recommendationFor(scored.scores.gradeFinal, S.appraisal.bands);
  return {
    ...scored,
    manager: { ...scored.manager, strengths: 'Reliable delivery against targets; sound working relationships.', improvements: 'Tighter documentation and earlier escalation of risks.', overallComment: 'Consistent performer who meets the role expectations.', recommendation: rec.recommendation, incrementPct: rec.incrementPct },
  };
};

// Walks an appraisal through [status, date, by, note] stages, stamping the fields the reducer stamps.
const advance = (apr, stages) => stages.reduce((a, [status, date, who, note = '']) => {
  const when = at(date);
  const next = { ...a, status, statusReason: '', history: [...a.history, { status, at: when, by: who, note }], updatedAt: when };
  if (status === A.MANAGER) next.self = { ...a.self, submittedAt: when };
  if (status === A.HR) next.manager = { ...a.manager, submittedAt: when, by: who };
  if (status === A.PUBLISHED && a.status === A.DISPUTED) next.dispute = { ...a.dispute, resolution: note, resolvedAt: when, resolvedBy: who };
  else if (status === A.PUBLISHED) next.hr = { ...a.hr, recommendation: a.manager.recommendation, incrementPct: a.manager.incrementPct, comment: 'Reviewed; no adjustment to the manager ratings.', reviewedAt: when, by: who };
  if (status === A.ACKNOWLEDGED) next.acknowledgement = { response: 'Agree', comment: note, at: when, by: who };
  if (status === A.DISPUTED) { next.acknowledgement = { response: 'Disagree', comment: note, at: when, by: who }; next.dispute = { ...a.dispute, comment: note }; }
  if (status === A.RETURNED || status === A.CANCELLED) next.statusReason = note;
  return next;
}, apr);

const buildAppraisals = (employees, cycles, templates) => {
  const emp = (id) => employees.find((e) => e.id === id);
  const [cyc2025, cycMy] = cycles;
  let n = 1000;
  const build = (id, cycle, type, asOf, code) => {
    const e = emp(id);
    return { ...buildAppraisal(e, cycle, type, templateFor(e, templates, type), S, HEAD, code || `APR-${++n}`, asOf), id, createdAt: at(asOf) };
  };

  // --- CYC-2025: all Closed and acknowledged; dates spread between the cycle due dates.
  const closed2025 = (id, opts, shift = 0) => {
    const apr = build(id, cyc2025, 'Annual', '2025-01-05');
    const self = asEmployee(id);
    const mgr = asManager(apr.managerId);
    const d = (date) => addDays(date, shift);
    return advance(rated(apr, emp(id), opts), [
      [A.AGREED, d('2025-01-18'), mgr, 'KPIs sent for agreement'], [A.SELF, d('2025-01-21'), self, 'Goals accepted'],
      [A.MANAGER, d('2026-01-06'), self, 'Self-assessment submitted'], [A.HR, d('2026-01-16'), mgr, 'Manager review submitted'],
      [A.PUBLISHED, '2026-02-09', HEAD, 'Results published'], [A.ACKNOWLEDGED, '2026-02-10T11', self, 'Agree'], [A.CLOSED, '2026-02-10T17', HEAD, 'Cycle closed'],
    ]);
  };
  const rakib2025 = closed2025('emp_rakib', { actuals: { 'SO-1': 92, 'SO-2': 95, 'SO-3': 96.5, 'SO-4': 33, 'SO-5': 470, 'SO-6': 88 }, rating: [4, 4, 3, 4, 4, 3] });
  const kamrul2025 = closed2025('emp_kamrul', { ach: 0.95, rating: 4 }, 1);
  const jahid2025 = closed2025('emp_jahid', { ach: 0.9, rating: 3, actuals: { 'PO-5': 96 } }, 2);
  const shimul2025 = closed2025('emp_shimul', { ach: 0.93, rating: 4 }, 1);
  const farhana2025 = closed2025('emp_farhana', { ach: 0.92, rating: 3 }, 3);
  // Written Warning of 2026-03-10 is outside the 2025 period, so no gate applies; C comes from the achievement.
  const hasan2025 = closed2025('emp_hasan', { ach: 0.78, rating: 3, attendance: snapshot(94, 3, 1, 12, at('2025-12-31')) }, 2);
  const jahangirBase = build('emp_jahangir', cyc2025, 'Annual', '2025-01-05');
  const jahangir2025 = advance(rated(jahangirBase, emp('emp_jahangir'), { ach: 0.88, rating: 3 }), [
    [A.AGREED, '2025-01-19', 'Kamrul Islam', 'KPIs sent for agreement'], [A.SELF, '2025-01-22', by, 'Goals accepted'],
    [A.MANAGER, '2026-01-08', by, 'Self-assessment submitted'], [A.HR, '2026-01-18', 'Kamrul Islam', 'Manager review submitted'],
    [A.PUBLISHED, '2026-02-09', HEAD, 'Results published'], [A.DISPUTED, '2026-02-09T15', by, 'Collection target was revised mid-year'],
    [A.PUBLISHED, '2026-02-10T10', HEAD, 'Target revision confirmed, score retained'], [A.ACKNOWLEDGED, '2026-02-10T14', by, 'Agree'], [A.CLOSED, '2026-02-10T17', HEAD, 'Cycle closed'],
  ]);
  const moushumi2025 = closed2025('emp_moushumi', { ach: 0.9, rating: 3 }, 1);
  const belalBase = closed2025('emp_belal', { ach: 0.7, rating: 2, attendance: snapshot(91, 5, 2, 12, at('2025-12-31')) }, 2);
  const belal2025 = { ...belalBase, hr: { ...belalBase.hr, pip: true, pipEndDate: '2026-05-10', comment: 'Unsatisfactory; 90-day performance improvement plan agreed.' } };

  // --- CYC-2026-MY: Open, every stage represented (relative dates).
  const open = rel(-97);
  const my = (id) => build(id, cycMy, 'Half-yearly', open);
  const months = 6;
  const snapMy = (pct = 97.5, lates = 1.3, unapproved = 0) => snapshot(pct, lates, unapproved, months, at(rel(-86)));
  const rakibMyBase = my('emp_rakib');
  const selfActuals = { 'SO-1': 92, 'SO-2': 95, 'SO-3': 96.5, 'SO-4': 33, 'SO-5': 470, 'SO-6': 88 };
  const rakibMy = advance({
    ...rakibMyBase,
    kpis: rakibMyBase.kpis.map((k) => ({ ...k, actualSelf: String(selfActuals[k.code]), selfComment: 'Per DSR summary' })),
    competencies: rakibMyBase.competencies.map((c, i) => ({ ...c, selfRating: String([4, 4, 3, 4, 4, 3][i]) })),
    self: { ...rakibMyBase.self, overallComment: 'Primary and secondary targets largely met; collection improved in Q2.', achievements: 'Opened 22 new outlets in Mirpur; cleared two overdue distributors.' },
  }, [[A.AGREED, rel(-93), 'Kamrul Islam', 'KPIs sent for agreement'], [A.SELF, rel(-91), 'Rakib Hasan', 'Goals accepted'], [A.MANAGER, rel(-86), 'Rakib Hasan', 'Self-assessment submitted']]);
  const kamrulMy = advance(my('emp_kamrul'), [[A.AGREED, rel(-92), HEAD, 'KPIs sent for agreement (on behalf of Nusrat Jahan)'], [A.SELF, rel(-90), 'Kamrul Islam', 'Goals accepted']]);
  const jahidMy = advance(rated(my('emp_jahid'), emp('emp_jahid'), { ach: 0.97, rating: 4, attendance: snapMy() }), [
    [A.AGREED, rel(-93), 'Mizanur Rahman', 'KPIs sent for agreement'], [A.SELF, rel(-91), by, 'Goals accepted'], [A.MANAGER, rel(-85), by, 'Self-assessment submitted'], [A.HR, rel(-76), 'Mizanur Rahman', 'Manager review submitted'],
  ]);
  const shimulMy = advance(rated(my('emp_shimul'), emp('emp_shimul'), { ach: 0.93, rating: 4, attendance: snapMy() }), [
    [A.AGREED, rel(-93), 'Mizanur Rahman', 'KPIs sent for agreement'], [A.SELF, rel(-91), by, 'Goals accepted'], [A.MANAGER, rel(-85), by, 'Self-assessment submitted'], [A.HR, rel(-75), 'Mizanur Rahman', 'Manager review submitted'], [A.PUBLISHED, rel(-60), HEAD, 'Results published'],
  ]);
  const farhanaMy = advance(my('emp_farhana'), [[A.AGREED, rel(-92), HEAD, 'KPIs sent for agreement']]);
  const hasanMy = my('emp_hasan');
  const jahangirMy = advance(my('emp_jahangir'), [[A.AGREED, rel(-93), 'Kamrul Islam', 'KPIs sent for agreement'], [A.CANCELLED, '2026-09-05', by, 'Separation initiated']]);
  const rafiqulMy = advance(rated(my('emp_rafiqul'), emp('emp_rafiqul'), { ach: 0.93, rating: 4, actuals: { 'IT-2': 99.2 }, attendance: snapMy() }), [
    [A.AGREED, rel(-93), 'Tahmina Akter', 'KPIs sent for agreement'], [A.SELF, rel(-91), by, 'Goals accepted'], [A.MANAGER, rel(-84), by, 'Self-assessment submitted'], [A.HR, rel(-74), 'Tahmina Akter', 'Manager review submitted'],
    [A.RETURNED, rel(-70), by, 'Evidence missing for uptime KPI'],
  ]);
  const moushumiMy = advance(my('emp_moushumi'), [[A.CANCELLED, '2026-07-02', by, 'Separation initiated']]);
  const belalMy = advance(my('emp_belal'), [[A.CANCELLED, '2026-07-31', by, 'Separation initiated']]);
  // Department heads report to the MD; their reviews wait with HR.
  const headMy = (id, ach, offset) => advance(rated(my(id), emp(id), { ach, rating: 4, attendance: snapMy() }), [
    [A.AGREED, rel(-93 + offset), 'Anisur Rahman', 'KPIs sent for agreement'], [A.SELF, rel(-91 + offset), asEmployee(id), 'Goals accepted'],
    [A.MANAGER, rel(-84 + offset), asEmployee(id), 'Self-assessment submitted'], [A.HR, rel(-73 + offset), 'Anisur Rahman', 'Manager review submitted'],
  ]);
  const tahminaMy = headMy('emp_tahmina', 0.96, 0);
  const nusratMy = headMy('emp_nusrat', 1.02, 1);
  const mizanMy = headMy('emp_mizan', 0.95, 2);
  const sabbirMy = headMy('emp_sabbir', 0.93, 3);

  // --- Probation reviews (no cycle).
  const sumaiyaBase = { ...build('emp_sumaiya', null, 'Probation', '2026-05-04', 'APR-1030'), createdBy: by };
  const sumaiyaProb = advance({
    ...sumaiyaBase,
    history: [{ ...sumaiyaBase.history[0], by }],
    kpis: sumaiyaBase.kpis.map((k) => ({ ...k, actualSelf: { 'PR-1': '1', 'PR-2': '4', 'PR-3': '4' }[k.code] || '', selfComment: 'Induction completed in May; month-end tasks handled from July.' })),
    competencies: sumaiyaBase.competencies.map((c) => ({ ...c, selfRating: '4' })),
    self: { ...sumaiyaBase.self, overallComment: 'Settled into the accounts team and now handle supplier vouchers independently.', achievements: 'Bank reconciliation for two accounts completed on time since July.' },
  }, [[A.AGREED, '2026-05-10', 'Tahmina Akter', 'KPIs sent for agreement'], [A.SELF, '2026-05-12', 'Sumaiya Khatun', 'Goals accepted'], [A.MANAGER, '2026-10-01', 'Sumaiya Khatun', 'Self-assessment submitted']]);
  const abdulBase = { ...build('emp_abdul', null, 'Probation', '2026-08-18', 'APR-1031'), createdBy: by };
  const abdulProb = { ...abdulBase, history: [{ ...abdulBase.history[0], by }] };

  const withId = (apr, id) => ({ ...apr, id });
  return [
    withId(rakib2025, 'apr_rakib_2025'), withId(kamrul2025, 'apr_kamrul_2025'), withId(jahid2025, 'apr_jahid_2025'), withId(shimul2025, 'apr_shimul_2025'), withId(farhana2025, 'apr_farhana_2025'),
    withId(hasan2025, 'apr_hasan_2025'), withId(jahangir2025, 'apr_jahangir_2025'), withId(moushumi2025, 'apr_moushumi_2025'), withId(belal2025, 'apr_belal_2025'),
    withId(rakibMy, 'apr_rakib_my'), withId(kamrulMy, 'apr_kamrul_my'), withId(jahidMy, 'apr_jahid_my'), withId(shimulMy, 'apr_shimul_my'), withId(farhanaMy, 'apr_farhana_my'), withId(hasanMy, 'apr_hasan_my'),
    withId(jahangirMy, 'apr_jahangir_my'), withId(rafiqulMy, 'apr_rafiqul_my'), withId(moushumiMy, 'apr_moushumi_my'), withId(belalMy, 'apr_belal_my'),
    withId(tahminaMy, 'apr_tahmina_my'), withId(nusratMy, 'apr_nusrat_my'), withId(mizanMy, 'apr_mizan_my'), withId(sabbirMy, 'apr_sabbir_my'),
    withId(sumaiyaProb, 'apr_sumaiya_prob'), withId(abdulProb, 'apr_abdul_prob'),
  ];
};

// ---------------------------------------------------------------------------
// H.3 Leave requests (relative dates; days counted on the working calendar)

const buildLeaveRequests = (employees, leaveTypes) => {
  const request = (id, code, empId, typeCode, from, to, status, { approverId, decidedBy = '', comment = '', reason, handoverTo = '' }) => {
    const e = employees.find((x) => x.id === empId);
    const typeCfg = leaveTypes.find((x) => x.code === typeCode);
    // Requests are raised about five days before the leave starts, never later than yesterday.
    const requestedOn = addDays(from, -5) < t ? addDays(from, -5) : rel(-1);
    const decidedOn = addDays(requestedOn, 1);
    return {
      ...emptyLeaveRequest(empId, asEmployee(empId)), id, code, typeCode, from, to, halfDay: false, days: countLeaveDays(from, to, false, S.calendar, typeCfg), reason, handoverTo, status,
      approverId: approverId ?? e.employment.reportingManagerId, requestedAt: at(requestedOn),
      decision: decidedBy ? { by: decidedBy, at: at(decidedOn), comment } : { by: '', at: '', comment: '' }, updatedAt: at(decidedBy ? decidedOn : requestedOn),
    };
  };
  return [
    request('lvr_1001', 'LV-1001', 'emp_rakib', 'EL', rel(-22), rel(-20), LEAVE_STATUS.APPROVED, { decidedBy: 'Kamrul Islam', comment: 'Approved; Jahangir covers the territory', reason: 'Family wedding in Tangail', handoverTo: 'Jahangir Alam' }),
    request('lvr_1002', 'LV-1002', 'emp_sumaiya', 'CL', rel(2), rel(2), LEAVE_STATUS.PENDING, { approverId: 'emp_tahmina', reason: 'University convocation' }),
    request('lvr_1003', 'LV-1003', 'emp_jahid', 'SL', rel(-48), rel(-47), LEAVE_STATUS.APPROVED, { decidedBy: 'Mizanur Rahman', comment: 'Get well soon', reason: 'Fever; medical certificate attached' }),
    request('lvr_1004', 'LV-1004', 'emp_kamrul', 'EL', rel(6), rel(10), LEAVE_STATUS.PENDING, { approverId: 'emp_nusrat', reason: 'Annual holiday with family', handoverTo: 'Rakib Hasan' }),
    request('lvr_1005', 'LV-1005', 'emp_hasan', 'CL', rel(-33), rel(-32), LEAVE_STATUS.REJECTED, { decidedBy: HEAD, comment: 'Driver roster full', reason: 'Personal work at home' }),
    request('lvr_1006', 'LV-1006', 'emp_farhana', 'EL', rel(-57), rel(-54), LEAVE_STATUS.APPROVED, { decidedBy: HEAD, comment: 'Approved', reason: 'Visit to parents in Gazipur', handoverTo: 'Sabbir Hossain' }),
    request('lvr_1007', 'LV-1007', 'emp_jahangir', 'EL', rel(-92), rel(-91), LEAVE_STATUS.APPROVED, { decidedBy: 'Kamrul Islam', comment: 'Approved', reason: 'Distributor event in Chattogram' }),
    request('lvr_1008', 'LV-1008', 'emp_abdul', 'LWP', rel(-12), rel(-12), LEAVE_STATUS.PENDING, { approverId: 'emp_shimul', reason: 'Missed shift; requesting leave without pay' }),
    request('lvr_1009', 'LV-1009', 'emp_nusrat', 'EL', rel(-127), rel(-123), LEAVE_STATUS.APPROVED, { decidedBy: 'Anisur Rahman', comment: 'Approved', reason: 'Eid holidays extended', handoverTo: 'Kamrul Islam' }),
    request('lvr_1010', 'LV-1010', 'emp_hasan', 'EL', rel(15), rel(17), LEAVE_STATUS.PENDING, { approverId: 'emp_sabbir', reason: 'Village land registration' }),
  ];
};

// ---------------------------------------------------------------------------
// H.4 Attendance — the last three months for every active (non-draft) employee

const buildAttendance = (employees, leaveRequests, settlements, leaveTypes) => {
  const months = lastMonths(3, t);
  // Sheets of employees whose settlement is already paid are archived (Belal has none).
  const archived = new Set(settlements.filter((s) => s.status === ST.PAID).map((s) => s.employeeId));
  // [month −1, month −2, month −3]; default absent 0, late 1.
  const pattern = {
    emp_hasan: { late: [5, 6, 5], absent: [0, 2, 0], unapproved: [0, 2, 0] },
    emp_rakib: { late: [1, 1, 1] },
    emp_jahangir: { late: [3, 1, 1], absent: [1, 0, 0] },
    emp_sumaiya: { late: [0, 0, 0] },
    emp_abdul: { late: [0, 0, 0] },
    emp_kamrul: { late: [1, 1, 2] },
  };
  const rows = [];
  employees.filter((e) => e.status !== E.DRAFT && !archived.has(e.id)).forEach((e) => {
    months.forEach((m, i) => {
      if (m < monthKey(e.employment.joinDate)) return;
      if (e.separatedAt && m > monthKey(e.separatedAt)) return;
      const p = pattern[e.id] || {};
      const absent = p.absent?.[i] ?? 0;
      const unapproved = p.unapproved?.[i] ?? 0;
      const leave = approvedLeaveDaysInMonth(e.id, m, leaveRequests, S.calendar, leaveTypes);
      const lwp = lwpDaysInMonth(e.id, m, leaveRequests, S.calendar, leaveTypes);
      const base = emptyAttendance(e.id, m, S.calendar);
      rows.push({
        ...base, present: base.workingDays - absent - leave - lwp, absent, unapproved, unapprovedRun: unapproved, late: p.late?.[i] ?? 1, earlyOut: 0, leave, lwp, overtimeHrs: '0',
        remarks: unapproved ? 'Unapproved absence; explanation sought' : '', enteredBy: by, locked: i > 0, updatedAt: at(addDays(`${m}-01`, 33)),
      });
    });
  });
  return rows;
};

// ---------------------------------------------------------------------------
// H.5 Settlements (statement numbers come from computeSettlement at build)

// Patch clearance rows by department: { DEPT: [status, signedBy, date, remarks, recoverable] }.
const sign = (rows, patches) => rows.map((r) => {
  const p = patches[r.dept];
  if (!p) return r;
  const [status, who, date, remarks = '', recoverable = ''] = p;
  return { ...r, status, signedBy: who, signedAt: at(date), remarks, recoverable };
});
const steps = (list) => list.map(([status, date, who = by, note = '']) => ({ status, at: at(date), by: who, note }));
const CLEARED = CLEARANCE_STATUS.CLEARED;

const buildSettlements = (employees) => {
  const emp = (id) => employees.find((e) => e.id === id);
  // Frozen statement stamped with the date it was finalised.
  const frozen = (sep, e, asOf, who) => {
    const next = freezeStatement(sep, e, S, { asOf }, who);
    return { ...next, statement: { ...next.statement, computedAt: at(asOf) } };
  };

  const jahangir = emp('emp_jahangir');
  const stlJahangir = {
    ...emptySettlement(jahangir, by, S, '2026-09-05'),
    id: 'stl_jahangir', code: 'FS-1001', type: 'Resignation', reason: 'Better opportunity', noticeDate: '2026-09-05', lastWorkingDay: '2026-10-20', noticeRequiredDays: 60, noticeWaivedDays: '0',
    previousStatus: E.CONFIRMED, status: ST.CLEARANCE,
    clearance: sign(defaultClearance(), {
      IT: [CLEARED, by, '2026-09-10', 'Laptop and accessories returned; accounts disabled'],
      ADMIN: [CLEARED, by, '2026-09-10', 'ID card, keys and SIM returned'],
      FINANCE: [CLEARANCE_STATUS.DUES, 'Tahmina Akter', '2026-09-12', 'Salary advance BDT 10,000 outstanding — recover in settlement', '10000'],
    }),
    inputs: settlementInputsFrom(jahangir, { elBalance: 18 }),
    statement: null,
    documents: [doc(SEPARATION_DOC_TYPES.RESIGNATION, { ago: 31, fileName: 'resignation_jahangir_alam.pdf' }), doc(SEPARATION_DOC_TYPES.ACCEPTANCE, { ago: 30, uploadedBy: HEAD })],
    history: steps([[ST.INITIATED, '2026-09-05', by, 'Resignation letter received and accepted'], [ST.CLEARANCE, '2026-09-07', by, 'Clearance started']]),
    createdAt: at('2026-09-05'), updatedAt: at('2026-09-12'),
  };

  const moushumi = emp('emp_moushumi');
  const stlMoushumi = frozen({
    ...emptySettlement(moushumi, by, S, '2026-07-02'),
    id: 'stl_moushumi', code: 'FS-1002', type: 'Resignation', reason: 'Relocating abroad', noticeDate: '2026-07-02', lastWorkingDay: '2026-08-31', noticeRequiredDays: 60, noticeWaivedDays: '0',
    previousStatus: E.CONFIRMED, status: ST.FINANCE_APPROVAL,
    clearance: sign(defaultClearance(), {
      IT: [CLEARED, by, '2026-08-31', 'All assets returned'], ADMIN: [CLEARED, by, '2026-08-31', 'ID card and keys returned'], FINANCE: [CLEARED, 'Tahmina Akter', '2026-09-01', 'No advances outstanding'],
      HR: [CLEARED, by, '2026-09-02', 'Exit interview done; leave reconciled'], LINE: [CLEARED, HEAD, '2026-09-02', 'Handover completed (signed on behalf of the line manager)'],
    }),
    inputs: settlementInputsFrom(moushumi, { elBalance: 9 }),
    approvals: [{ stage: 'HR', decision: 'Approved', by: HEAD, at: at('2026-09-05'), comment: 'Dues verified against the leave and PF ledgers' }],
    exitInterviewDone: true,
    documents: [doc(SEPARATION_DOC_TYPES.RESIGNATION, { ago: 96, fileName: 'resignation_moushumi_das.pdf' }), doc(SEPARATION_DOC_TYPES.CLEARANCE, { ago: 34 })],
    history: steps([[ST.INITIATED, '2026-07-02', by, 'Resignation letter received'], [ST.CLEARANCE, '2026-07-03', by, 'Clearance started'], [ST.HR_APPROVAL, '2026-09-03', by, 'Dues finalised and submitted'], [ST.FINANCE_APPROVAL, '2026-09-05', HEAD, 'HR approved']]),
    createdAt: at('2026-07-02'), updatedAt: at('2026-09-05'),
  }, moushumi, '2026-09-03', by);

  const belal = emp('emp_belal');
  const belalFrozen = frozen({
    ...emptySettlement(belal, by, S, '2026-07-31'),
    id: 'stl_belal', code: 'FS-1003', type: 'Termination', reason: 'Position abolished after line closure', noticeDate: '2026-07-31', lastWorkingDay: '2026-07-31', noticeRequiredDays: 120, noticeWaivedDays: '0', payInLieu: true, payInLieuDays: '',
    previousStatus: E.CONFIRMED, status: ST.PAID,
    clearance: sign(defaultClearance(), {
      IT: [CLEARED, by, '2026-08-01', 'No IT assets issued'], ADMIN: [CLEARED, by, '2026-08-01', 'Locker and ID card returned'], FINANCE: [CLEARED, 'Tahmina Akter', '2026-08-02', 'No dues'],
      HR: [CLEARED, by, '2026-08-03', 'Personal file complete'], LINE: [CLEARED, HEAD, '2026-08-03', 'Tools and PPE returned (signed on behalf of the line supervisor)'],
    }),
    inputs: settlementInputsFrom(belal, { elBalance: 11 }),
    approvals: [
      { stage: 'HR', decision: 'Approved', by: HEAD, at: at('2026-08-05'), comment: 'Notice pay and compensation per s.26' },
      { stage: 'Finance', decision: 'Approved', by: 'Tahmina Akter', at: at('2026-08-08'), comment: 'Budget available under line closure provision' },
      { stage: 'Management', decision: 'Approved', by: 'Anisur Rahman', at: at('2026-08-12'), comment: 'Approved' },
    ],
    serviceCertificate: { issued: true, issuedAt: at('2026-08-28'), by },
    exitInterviewDone: true,
    documents: [doc(SEPARATION_DOC_TYPES.TERMINATION, { ago: 68, uploadedBy: HEAD }), doc(SEPARATION_DOC_TYPES.CLEARANCE, { ago: 64 }), doc(SEPARATION_DOC_TYPES.STATEMENT, { ago: 40 }), doc(SEPARATION_DOC_TYPES.CERTIFICATE, { ago: 39 })],
    history: steps([
      [ST.INITIATED, '2026-07-31', by, 'Termination notice served with pay in lieu'], [ST.CLEARANCE, '2026-07-31', by, 'Clearance started'], [ST.HR_APPROVAL, '2026-08-04', by, 'Dues finalised and submitted'],
      [ST.FINANCE_APPROVAL, '2026-08-05', HEAD, 'HR approved'], [ST.MGMT_APPROVAL, '2026-08-08', 'Tahmina Akter', 'Finance approved'], [ST.APPROVED, '2026-08-12', 'Anisur Rahman', 'Management approved'],
      [ST.PAID, '2026-08-27', 'System Admin', 'Paid by bank transfer'],
    ]),
    createdAt: at('2026-07-31'), updatedAt: at('2026-08-28'),
  }, belal, '2026-08-04', by);
  // Tahmina approved the Finance stage, so the payment is recorded by the Admin user (separation of duties, A.2 #10).
  const stlBelal = {
    ...belalFrozen,
    payment: { ...belalFrozen.payment, paidAt: '2026-08-27', mode: 'Bank Transfer', reference: 'FS-1003/EBL/0827', amount: String(belalFrozen.statement.totals.netPayable), payee: 'Employee', payeeName: belal.name, pfPaidAt: '2026-08-27', pfReference: 'PF/2026/0827-03', paidBy: 'System Admin' },
  };

  return [stlJahangir, stlMoushumi, stlBelal];
};

// ---------------------------------------------------------------------------

export const seedHr = () => {
  const hrSettings = structuredClone(DEFAULT_HR_SETTINGS);
  const leaveTypes = structuredClone(DEFAULT_LEAVE_TYPES);
  const kpiTemplates = structuredClone(DEFAULT_KPI_TEMPLATES);
  const appraisalCycles = buildCycles();
  const built = buildEmployees();
  const appraisals = buildAppraisals(built, appraisalCycles, kpiTemplates);
  // lastAppraisal is what CLOSE_CYCLE copied when CYC-2025 closed.
  const closed = appraisalCycles[0];
  const employees = built.map((e) => {
    const a = appraisals.find((x) => x.employeeId === e.id && x.cycleId === closed.id);
    return a ? { ...e, lastAppraisal: { code: a.code, cycle: closed.code, grade: a.scores.gradeFinal, final: a.scores.final, at: closed.closedAt } } : e;
  });
  const leaveRequests = buildLeaveRequests(employees, leaveTypes);
  const settlements = buildSettlements(employees);
  const attendance = buildAttendance(employees, leaveRequests, settlements, leaveTypes);
  return { employees, kpiTemplates, appraisalCycles, appraisals, leaveTypes, leaveRequests, attendance, settlements, hrSettings };
};

// Audit trail of the seed: every entry anchors to the employee (A.2 #2) and `by` is always a user name.
export const seedHrAudit = (hr) => {
  const entries = [];
  const push = (e, action, who, when, detail = '', ref = null) =>
    entries.push({ id: uid('aud'), portal: 'hr', customerId: e.id, customerCode: e.code || '(draft)', businessName: e.name, action, by: who, at: when, detail, ...(ref ? { refId: ref.id, refCode: ref.code } : {}) });
  const empOf = (id) => hr.employees.find((e) => e.id === id);
  const cycleOf = (id) => hr.appraisalCycles.find((c) => c.id === id);
  const ACTION = { [A.CLOSED]: 'Appraisal Closed', [A.CANCELLED]: 'Appraisal Cancelled' };

  hr.employees.forEach((e) => {
    push(e, 'Created', e.createdBy, e.createdAt, 'Employee record created');
    if (e.status === E.DRAFT) return;
    push(e, 'Activated', by, at(e.employment.joinDate), `${e.code} assigned`);
    if (e.employment.confirmationDate && e.status !== E.PROBATION) push(e, 'Confirmed', HEAD, at(e.employment.confirmationDate), e.employment.probation.required ? 'Probation confirmed' : 'Confirmed on joining');
    e.disciplinary.forEach((d) => push(e, 'Disciplinary Recorded', d.by, d.at, `${d.type} (${d.reference}): ${d.note}`));
  });
  hr.settlements.forEach((s) => {
    const e = empOf(s.employeeId);
    push(e, 'Separation Initiated', s.createdBy, s.createdAt, `${s.code}: ${s.type}, LWD ${s.lastWorkingDay}`, s);
    s.clearance.filter((r) => r.signedAt).forEach((r) => push(e, 'Clearance Signed', r.signedBy, r.signedAt, `${s.code}: ${r.label} — ${r.status}${r.remarks ? ` (${r.remarks})` : ''}`, s));
    if (s.statement) push(e, 'Dues Computed', s.statement.computedBy, s.statement.computedAt, `${s.code}: net payable ${fmtMoney2(s.statement.totals.netPayable)}`, s);
    s.approvals.forEach((a) => push(e, `${a.stage} ${a.decision}`, a.by, a.at, `${s.code}: ${a.comment}`, s));
    const exit = s.history.find((h) => h.status === ST.HR_APPROVAL);
    if (e.status === E.SEPARATED && exit) push(e, 'Exit Completed', exit.by, exit.at, `Last working day ${s.lastWorkingDay}`, s);
    if (s.payment.paidAt) push(e, 'Settlement Paid', s.payment.paidBy, at(s.payment.paidAt), `${s.code}: ${fmtMoney2(s.payment.amount)} by ${s.payment.mode}, ref ${s.payment.reference}`, s);
    if (s.serviceCertificate.issued) push(e, 'Service Certificate Issued', s.serviceCertificate.by, s.serviceCertificate.issuedAt, s.code, s);
  });
  hr.appraisals.forEach((a) => {
    const e = empOf(a.employeeId);
    const [created, ...rest] = a.history;
    push(e, 'Appraisal Created', created.by, created.at, `${a.code}: ${cycleOf(a.cycleId)?.name || 'Probation review'}`, a);
    rest.forEach((h) => push(e, ACTION[h.status] || h.status, h.by, h.at, `${a.code}: ${h.note}`, a));
  });
  hr.leaveRequests.forEach((r) => {
    const e = empOf(r.employeeId);
    push(e, 'Leave Requested', r.requestedBy, r.requestedAt, `${r.code}: ${r.typeCode} ${r.from} → ${r.to} (${r.days}d)`, r);
    if (r.decision.at) push(e, `Leave ${r.status}`, r.decision.by, r.decision.at, `${r.code}: ${r.decision.comment}`, r);
  });
  hr.appraisalCycles.forEach((c) => {
    if (c.openedAt) push(HR_SYSTEM, 'Cycle Opened', c.createdBy, c.openedAt, `${c.code}: ${c.name}`);
    if (c.closedAt) push(HR_SYSTEM, 'Cycle Closed', c.createdBy, c.closedAt, `${c.code}: ${c.name}`);
  });
  return entries.sort((a, b) => new Date(b.at) - new Date(a.at));
};

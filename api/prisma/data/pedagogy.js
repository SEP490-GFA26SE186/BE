// =============================================================================
// Ky nang con + mau cau hoi seed (spec 2026-10-20-casel-pedagogy §5.1, §5.2, Phu luc A)
//
// - Moi ky nang con tro ve dung 1 muc CASEL (caselCode = code trong data/casel.js), cung nang luc.
// - Moi ky nang con co 1-2 mau; moi mau co it nhat 1 ban KHONG nhan nhan vat khac (needsTarget=false)
//   de truyen chi co 1 nhan vat van sinh duoc.
// - Khung cau hoi dung token {NV1} (nhan vat chinh); {NV2} chi khi needsTarget = true. Nhan vat phu
//   khong co ten rieng (ban moi, em be, ba...) thi goi bang danh xung chung ("ban ay").
// - Theo 7 nguyen tac noi dung (ai/docs/07-content-principles.md): khong giang dao ly, he qua tu
//   nhien, phuong an impulsive khong bao gio nguy hiem, khong so sanh.
// - Day la ban nhap do Claude soan; Specialist doc va ban hanh (spec §5.2). Seed chi tao khi chua co,
//   khong ghi de ban Specialist da sua.
// =============================================================================

import { CASEL_URL } from './casel.js';

export const SELWEB_URL = 'https://edinstruments.org/instruments/selweb';

const base = {
  needsTarget: false,
  allowedEmotions: [],
  correctDesc: null,
  distractorDesc: null,
  constructiveDesc: null,
  avoidantDesc: null,
  impulsiveDesc: null,
  constructiveScore: null,
  avoidantScore: null,
  impulsiveScore: null,
  hintGuidance: null,
  referenceUrl: CASEL_URL,
};

const emotionPick = (t) => ({ ...base, answerFormat: 'emotion_pick', ...t });
const singleCorrect = (t) => ({ ...base, answerFormat: 'single_correct', ...t });
// Diem mac dinh theo vai: xay dung 1 / ne tranh 0,5 / boc dong 0 (spec §5.2)
const roleChoice = (t) => ({
  ...base,
  answerFormat: 'role_choice',
  constructiveScore: 1,
  avoidantScore: 0.5,
  impulsiveScore: 0,
  ...t,
});

// Cau dung chung cho trang truoc cau hoi cam xuc (nguyen tac 4: khong goi ten cam xuc la dap an)
const NO_EMOTION_WORD =
  'Không viết thẳng tên cảm xúc là đáp án ở trang này; để dấu hiệu tự nói lên.';
const ROLE_CHOICE_PAGE =
  'Ba hành động đều là điều trẻ thật có thể làm; sau câu hỏi, mạch truyện đi về hướng làm lành, sửa được, dù bé chọn gì.';

export const SUB_SKILLS = [
  // ---------------------------------------------------------------------------
  // Self-awareness — Tự nhận thức
  // ---------------------------------------------------------------------------
  {
    code: 'sa_emotion_naming',
    skill: 'self_awareness',
    caselCode: 'sa_identifying_emotions',
    nameVi: 'Gọi tên cảm xúc của mình',
    descriptionVi:
      'Bé nhận ra và gọi đúng tên cảm xúc cơ bản (vui, buồn, giận, sợ, bình thường) của nhân vật chính qua nét mặt, cơ thể, lời nói và sự việc vừa xảy ra — bước đầu để hiểu cảm xúc của chính mình.',
    ageMin: 5,
    ageMax: 8,
    order: 1,
    templates: [
      emotionPick({
        title: 'Nhân vật chính đang cảm thấy thế nào?',
        questionFrame: 'Lúc này {NV1} đang cảm thấy thế nào?',
        // "binh thuong" khong dung duoc voi yeu cau >= 2 dau hieu cu the
        allowedEmotions: ['happy', 'sad', 'angry', 'scared'],
        pageSetup:
          `Kể một sự việc rõ ràng vừa xảy ra với {NV1} (được quà, bị làm đổ tháp, phải chia tay bà) và tả ít nhất hai dấu hiệu cụ thể của cảm xúc: nét mặt, cơ thể, giọng nói hoặc hành động. Cảm xúc phải khớp với sự việc, không mơ hồ. ${NO_EMOTION_WORD}`,
        hintGuidance:
          'Nhắc lại một dấu hiệu có trong lời kể (ví dụ "mắt {NV1} ngấn nước"), không nhắc tranh, không nói ra đáp án.',
        parentPrompts: [
          'Trong truyện, lúc nào bạn nhỏ vui nhất, lúc nào buồn nhất? Sao con biết?',
          'Gần đây lúc nào con cũng thấy giống bạn ấy? Lúc đó chuyện gì đã xảy ra?',
          'Khi con thấy như vậy, mặt con và người con thế nào?',
        ],
        rationale:
          'CASEL đặt "Identifying one\'s emotions" là kỹ năng nền của Tự nhận thức. Với trẻ 5–8 tuổi, nhận diện cảm xúc từ dấu hiệu trong một tình huống minh hoạ là cách đo trực tiếp được dùng trong SELweb (McKown; https://edinstruments.org/instruments/selweb). Mẫu giới hạn tập cảm xúc được phép; AI chọn một cảm xúc trong tập đó và dựng trang trước bằng dấu hiệu cho đúng cảm xúc ấy; backend kiểm đáp án thuộc tập; Specialist soát mẫu các câu đã sinh (spec §9b, §8). Bé chọn 1 trong 5 cảm xúc và được so với đáp án đã kiểm như vậy.',
      }),
      emotionPick({
        title: 'Cơ thể báo hiệu cảm xúc gì?',
        questionFrame: 'Nhìn người {NV1} lúc này, {NV1} đang cảm thấy gì?',
        pageSetup:
          `Tập trung vào dấu hiệu cơ thể của {NV1}: tim đập nhanh, mặt nóng bừng, tay nắm chặt, bụng thắt lại, chân không muốn bước, giọng run. Sự việc gây ra cảm xúc là chuyện đời thường, vừa tầm tuổi. Chỉ dùng giận, sợ hoặc buồn. ${NO_EMOTION_WORD}`,
        allowedEmotions: ['angry', 'scared', 'sad'],
        hintGuidance:
          'Nhắc lại dấu hiệu trong cơ thể {NV1} đã kể ở trang trước (ví dụ "tay {NV1} nắm chặt lại"), không nói ra đáp án.',
        parentPrompts: [
          'Khi con giận, con thấy chỗ nào trong người thay đổi trước tiên?',
          'Còn khi con sợ, người con thấy thế nào?',
        ],
        rationale:
          'Nhận ra dấu hiệu cơ thể là một phần của "Identifying one\'s emotions" (CASEL): trẻ phải nhận ra cảm xúc khi nó đang đến thì mới tự điều chỉnh được. Mẫu chỉ cho 3 cảm xúc có dấu hiệu cơ thể rõ (giận, sợ, buồn) để câu hỏi không đánh đố.',
      }),
    ],
  },
  {
    code: 'sa_feeling_causes',
    skill: 'self_awareness',
    caselCode: 'sa_linking_feelings_values_thoughts',
    nameVi: 'Hiểu vì sao mình có cảm xúc ấy',
    descriptionVi:
      'Bé nối được cảm xúc với điều gây ra nó: một suy nghĩ hoặc một mong muốn của nhân vật chính ("mình nghĩ bạn không muốn chơi với mình nên mình buồn").',
    ageMin: 5,
    ageMax: 8,
    order: 2,
    templates: [
      singleCorrect({
        title: 'Điều gì làm nhân vật chính có cảm xúc ấy?',
        questionFrame: 'Điều gì làm {NV1} cảm thấy như vậy?',
        pageSetup:
          'Gọi tên rõ cảm xúc của {NV1} và cho thấy điều gây ra nó qua một suy nghĩ hoặc mong muốn của {NV1}, nói thành lời thoại hoặc lời kể ("{NV1} nghĩ…", "{NV1} rất muốn…"). Trong trang có thêm một sự việc phụ để làm phương án nhiễu.',
        correctDesc:
          'Đúng suy nghĩ hoặc mong muốn của {NV1} đã có trong lời kể, nói bằng lời trẻ con (ví dụ "Vì {NV1} nghĩ không ai đợi mình").',
        distractorDesc:
          'Hai lý do có vẻ hợp lý trong bối cảnh nhưng không phải điều lời kể nói: một sự việc phụ khác trong trang, và một chi tiết bề ngoài không liên quan đến cảm xúc (màu áo). Cả hai khác hẳn đáp án đúng; không đánh đố, không đùa cợt.',
        hintGuidance: 'Nhắc lại câu {NV1} đã nghĩ hoặc đã nói ở trang trước, không nói ra đáp án.',
        parentPrompts: [
          'Theo con, vì sao bạn nhỏ trong truyện lại thấy như vậy?',
          'Lúc con thấy buồn hay giận, con thường đang nghĩ gì trong đầu?',
        ],
        rationale:
          'CASEL mô tả "Linking feelings, values, and thoughts" là hiểu cảm xúc gắn với suy nghĩ và điều mình coi trọng. Câu hỏi yêu cầu bé tìm đúng suy nghĩ/mong muốn gây ra cảm xúc trong lời kể, nên đo được việc nối cảm xúc với suy nghĩ chứ không chỉ gọi tên cảm xúc.',
      }),
    ],
  },
  {
    code: 'sa_can_do',
    skill: 'self_awareness',
    caselCode: 'sa_self_efficacy',
    nameVi: 'Tin là mình làm được',
    descriptionVi:
      'Bé tin vào khả năng của mình khi gặp việc vừa sức nhưng còn mới: nhớ lại lần mình từng làm được và thử từng bước nhỏ thay vì bỏ cuộc.',
    ageMin: 5,
    ageMax: 8,
    order: 3,
    templates: [
      roleChoice({
        title: 'Khi việc có vẻ khó quá',
        questionFrame: '{NV1} thấy việc này khó quá. {NV1} sẽ làm gì?',
        pageSetup:
          `{NV1} gặp một việc vừa sức nhưng còn mới (tự buộc dây giày, xếp xong bức tranh ghép, tự đạp xe ba bánh lên dốc nhỏ), đã thử một lần chưa được. Trước đó trong truyện có nhắc một lần {NV1} từng làm được việc gần giống. ${ROLE_CHOICE_PAGE}`,
        constructiveDesc:
          'Nhớ lại lần mình từng làm được rồi thử lại từng bước nhỏ, có thể tự nhủ một câu ngắn như "Từ từ, mình làm được".',
        avoidantDesc: 'Để việc đó lại và chuyển sang chơi việc khác.',
        impulsiveDesc:
          'Bực bội đẩy đồ ra xa và nói "Mình chẳng làm được đâu" (không ném vào ai, không làm hỏng gì nguy hiểm).',
        parentPrompts: [
          'Bạn nhỏ trong truyện đã làm gì khi thấy việc khó? Nếu là con, con sẽ làm gì?',
          'Việc gì trước đây con thấy khó mà bây giờ con làm được rồi?',
          'Lần tới gặp việc khó, con muốn tự nói với mình câu gì?',
        ],
        rationale:
          'CASEL xếp "Experiencing self-efficacy" vào Tự nhận thức: tin rằng mình có thể làm được việc khi gặp thử thách. Ba phương án là ba phản ứng thật của trẻ trước việc khó; điểm cao nhất cho phản ứng dựa trên niềm tin vào khả năng của mình (nhớ lần thành công, thử lại), điểm giữa cho né tránh, thấp nhất cho tự phủ nhận.',
      }),
    ],
  },
  {
    code: 'sa_not_yet',
    skill: 'self_awareness',
    caselCode: 'sa_growth_mindset',
    nameVi: 'Chưa được thì tập thêm',
    descriptionVi:
      'Bé hiểu rằng chưa làm được không có nghĩa là không làm được: tập thêm, thử cách khác thì sẽ tiến bộ ("mình chưa giỏi việc này, mình đang tập").',
    ageMin: 5,
    ageMax: 8,
    order: 4,
    templates: [
      singleCorrect({
        title: 'Tự nói gì khi chưa làm được',
        questionFrame: '{NV1} có thể tự nói gì với mình lúc này?',
        pageSetup:
          '{NV1} vừa thử một việc chưa thành (bức vẽ chưa giống, viết chữ còn xiên, nhảy dây vấp chân) và đang thấy tiếc hoặc nản; cảm xúc gọi tên rõ. Không có ai chê cười hay so sánh {NV1} với người khác.',
        correctDesc:
          'Một câu tự nói theo hướng "chưa được thì tập thêm", gắn với đúng việc trong truyện (ví dụ "Mình chưa vẽ giống, mình thử lại lần nữa").',
        distractorDesc:
          'Hai câu tự nói hợp lý với trẻ nhưng không giúp {NV1} cố tiếp: một câu cho rằng mình sẽ không bao giờ làm được ("Mình không có khiếu"), và một câu đổ cho đồ vật hoặc may rủi ("Tại cái bút xấu").',
        hintGuidance: 'Nhắc rằng {NV1} đã từng tập và tiến bộ ở một việc khác trong truyện, không nói ra đáp án.',
        parentPrompts: [
          'Khi bạn nhỏ trong truyện làm chưa được, bạn ấy có thể tự nói gì với mình?',
          'Con đang tập việc gì mà con thấy mình tiến bộ hơn trước?',
        ],
        rationale:
          'CASEL nêu "Having a growth mindset" trong Tự nhận thức: tin rằng khả năng phát triển được qua cố gắng. Câu tự nói là dấu hiệu dễ quan sát nhất của tư duy phát triển ở trẻ nhỏ; phương án đúng là câu "chưa được thì tập thêm", hai phương án nhiễu là tư duy cố định và đổ lỗi ra ngoài.',
      }),
    ],
  },

  // ---------------------------------------------------------------------------
  // Self-management — Tự quản lý
  // ---------------------------------------------------------------------------
  {
    code: 'sm_calming_down',
    skill: 'self_management',
    caselCode: 'sm_managing_emotions',
    nameVi: 'Bình tĩnh lại khi cảm xúc mạnh',
    descriptionVi:
      'Khi đang giận, sợ hay tủi thân, bé chọn một cách làm dịu cảm xúc (hít thở, đếm, ôm gấu, nói ra cảm xúc) trước khi hành động.',
    ageMin: 5,
    ageMax: 8,
    order: 1,
    templates: [
      roleChoice({
        title: 'Khi cảm xúc dâng lên mạnh',
        questionFrame: '{NV1} đang thấy khó chịu lắm. {NV1} sẽ làm gì bây giờ?',
        pageSetup:
          `{NV1} đang có cảm xúc mạnh (giận, sợ hoặc tủi thân) vì một việc nhỏ đời thường (bị làm đổ tháp, phải tắt ti vi, nghe tiếng sấm). Cảm xúc được gọi tên rõ, có dấu hiệu cơ thể. {NV1} chưa làm gì. ${ROLE_CHOICE_PAGE}`,
        constructiveDesc:
          'Một cách tự làm dịu cụ thể, làm được ngay: hít thở thật chậm, đếm đến năm, ôm gấu bông, hoặc nói thành lời "Con đang giận/sợ".',
        avoidantDesc:
          'Lặng lẽ bỏ đi chỗ khác, ngồi im không nói với ai; không làm ai buồn nhưng cảm xúc vẫn còn nguyên.',
        impulsiveDesc:
          'Làm ngay theo cơn cảm xúc nhưng không nguy hiểm: hét to, dậm chân, gạt đồ chơi của mình khỏi bàn.',
        parentPrompts: [
          'Lúc bạn nhỏ trong truyện thấy rất giận hoặc rất sợ, bạn ấy đã làm gì?',
          'Khi con thấy như vậy, cách nào giúp con dịu lại nhanh nhất?',
          'Cả nhà mình có thể cùng dùng "cách bình tĩnh" nào?',
        ],
        rationale:
          'CASEL nêu "Managing one\'s emotions" là kỹ năng đầu tiên của Tự quản lý. Ba phương án là ba phản ứng thật khi cảm xúc mạnh: tự điều chỉnh (1 điểm), né tránh — không gây hại nhưng chưa điều chỉnh được cảm xúc (0,5), và hành động theo xung động (0). Điểm do mẫu quy định, AI chỉ viết lời theo mô tả từng vai.',
      }),
    ],
  },
  {
    code: 'sm_soothing_worries',
    skill: 'self_management',
    caselCode: 'sm_stress_strategies',
    nameVi: 'Biết cách tự xoa dịu khi lo, sợ',
    descriptionVi:
      'Bé biết và dùng được một vài cách tự xoa dịu khi lo lắng, sợ hãi (bật đèn ngủ, ôm đồ chơi quen, hít thở, gọi người lớn), và biết cách nào thật sự giúp mình dễ chịu hơn.',
    ageMin: 5,
    ageMax: 8,
    order: 2,
    templates: [
      singleCorrect({
        title: 'Cách nào giúp bớt lo, bớt sợ?',
        questionFrame: 'Việc nào giúp {NV1} bớt sợ hơn?',
        pageSetup:
          '{NV1} đang lo hoặc sợ vì một điều đời thường (bóng tối, tiếng gió, ngày đầu đi học); cảm xúc gọi tên rõ nhưng không tả điều đáng sợ một cách rùng rợn. Có thể có một người lớn hoặc đồ vật quen thuộc ở gần.',
        correctDesc:
          'Một cách tự xoa dịu cụ thể, an toàn, trẻ làm được ngay (bật đèn ngủ, ôm gấu bông, hít thở chậm, gọi mẹ).',
        distractorDesc:
          'Hai việc trẻ có thể làm nhưng không làm bớt sợ: một việc rõ ràng không làm dịu mà cũng không phải cách tự xoa dịu (tắt luôn đèn ngủ), và một việc làm {NV1} nghĩ mãi về điều đang lo (cứ nhìn chằm chằm vào góc tối). Cả hai khác hẳn đáp án đúng; không có gì đáng sợ thêm.',
        hintGuidance: 'Nhắc đồ vật hoặc người quen thuộc đang ở gần {NV1} trong trang trước, không nói ra đáp án.',
        parentPrompts: [
          'Bạn nhỏ trong truyện đã làm gì để bớt sợ? Con thấy cách đó thế nào?',
          'Khi con lo hay sợ, điều gì làm con thấy yên tâm hơn?',
        ],
        rationale:
          'CASEL nêu "Identifying and using stress management strategies" trong Tự quản lý. Câu hỏi đo bước "identifying": bé nhận ra cách nào thật sự giúp giảm lo, sợ, phân biệt với việc không liên quan hoặc làm nỗi lo kéo dài.',
      }),
      roleChoice({
        title: 'Khi thấy sợ một mình',
        questionFrame: '{NV1} đang thấy sợ. {NV1} sẽ làm gì?',
        pageSetup:
          `{NV1} ở một mình trong một tình huống đời thường gây sợ nhẹ (phòng tối trước giờ ngủ, mất điện một lúc, tiếng động lạ ngoài cửa sổ). Nỗi sợ gọi tên rõ, không tả rùng rợn; người lớn ở gần (phòng bên). ${ROLE_CHOICE_PAGE}`,
        constructiveDesc:
          'Dùng một cách tự xoa dịu (bật đèn ngủ, ôm gấu, hít thở) hoặc gọi người lớn bằng lời rõ ràng: "Mẹ ơi, con thấy sợ".',
        avoidantDesc: 'Trùm chăn kín đầu, nằm im chịu đựng và không nói với ai.',
        impulsiveDesc: 'Khóc ré lên, đạp tung chăn gối (không chạy ra chỗ nguy hiểm, không làm đau ai).',
        parentPrompts: [
          'Nếu là con trong truyện, con sẽ làm gì khi thấy sợ?',
          'Khi con gọi bố mẹ lúc đang sợ, con muốn bố mẹ làm gì cho con?',
          'Đồ vật nào ở nhà làm con thấy can đảm hơn khi trời tối?',
        ],
        rationale:
          'Mẫu đo bước "using" của "Identifying and using stress management strategies" (CASEL): bé có chọn dùng một cách tự xoa dịu hoặc tìm người lớn khi đang sợ không. Né tránh không gây hại (0,5) nhưng nỗi sợ không được giải toả; phản ứng bùng nổ được 0.',
      }),
    ],
  },
  {
    code: 'sm_finishing_tasks',
    skill: 'self_management',
    caselCode: 'sm_self_discipline_motivation',
    nameVi: 'Làm xong việc trước khi chơi',
    descriptionVi:
      'Bé tự giữ mình làm nốt một việc nhỏ đã hứa hoặc được giao dù có điều hấp dẫn hơn, và tự nhắc mình bằng một mục tiêu gần ("xong rồi mình chơi").',
    ageMin: 5,
    ageMax: 8,
    order: 3,
    templates: [
      roleChoice({
        title: 'Việc còn dang dở và lời rủ chơi',
        questionFrame: '{NV1} sẽ làm gì với việc còn dang dở?',
        pageSetup:
          `{NV1} đang làm một việc nhỏ đã hứa hoặc được giao (cất đồ chơi, tưới cây cùng ông, tô nốt bức tranh tặng bà) thì có điều hấp dẫn hơn xuất hiện (bạn rủ ra sân, phim hoạt hình bắt đầu). ${ROLE_CHOICE_PAGE}`,
        constructiveDesc:
          'Làm nốt việc trước, tự nhủ "xong rồi mình chơi", hoặc nói với bạn "Đợi tớ một chút" rồi quay lại làm cho xong.',
        avoidantDesc: 'Để việc dở đó, đi chơi và mong là không ai nhắc tới.',
        impulsiveDesc: 'Bỏ ngay đồ đang cầm xuống sàn, chạy ào đi chơi.',
        parentPrompts: [
          'Bạn nhỏ trong truyện đã làm gì khi đang dở việc mà có bạn rủ chơi?',
          'Khi đang làm dở mà muốn đi chơi, điều gì giúp con làm cho xong?',
        ],
        rationale:
          'CASEL nêu "Exhibiting self-discipline and self-motivation" trong Tự quản lý. Với trẻ 5–8 tuổi, kỹ năng này thể hiện ở việc trì hoãn điều hấp dẫn để hoàn thành việc nhỏ của mình. Phương án xây dựng là tự giữ mình kèm một mục tiêu gần; né tránh và bỏ ngang là hai phản ứng thường gặp.',
      }),
    ],
  },
  {
    code: 'sm_brave_first_step',
    skill: 'self_management',
    caselCode: 'sm_courage_initiative',
    nameVi: 'Dũng cảm bước bước đầu tiên',
    descriptionVi:
      'Bé dám thử một điều mới hoặc chủ động lên tiếng dù còn ngại, bằng một bước nhỏ vừa sức (giơ tay, hỏi một câu, bước lại gần), có thể nhờ người lớn đứng cạnh.',
    ageMin: 5,
    ageMax: 8,
    order: 4,
    templates: [
      roleChoice({
        title: 'Muốn thử mà còn ngại',
        questionFrame: '{NV1} muốn thử nhưng còn ngại. {NV1} sẽ làm gì?',
        pageSetup:
          `{NV1} đứng trước một điều mới, an toàn và vừa sức (lần đầu tự vào phòng tối lấy gấu bông khi đèn hành lang vẫn sáng, giơ tay phát biểu, xin vào chơi cùng nhóm bạn). {NV1} muốn làm nhưng thấy ngại hoặc hồi hộp, gọi tên rõ. ${ROLE_CHOICE_PAGE}`,
        constructiveDesc:
          'Thử một bước nhỏ: hít một hơi rồi giơ tay, bước lại gần, hoặc nhờ người lớn đứng cạnh trong lúc mình làm.',
        avoidantDesc: 'Đứng ngoài nhìn và tự nhủ để lần sau.',
        impulsiveDesc:
          'Lao vào ngay không để ý gì: chen lên trước, nói to cắt lời người khác (không làm gì nguy hiểm).',
        parentPrompts: [
          'Trong truyện, bạn nhỏ đã dũng cảm thử điều gì?',
          'Điều gì con muốn thử mà còn ngại? Bước nhỏ đầu tiên có thể là gì?',
        ],
        rationale:
          'CASEL nêu "Showing the courage to take initiative" trong Tự quản lý. Câu hỏi đặt bé vào lúc muốn thử nhưng còn ngại; phương án xây dựng là chủ động bằng một bước nhỏ an toàn, khác với né tránh và với hấp tấp không để ý người khác.',
      }),
    ],
  },

  // ---------------------------------------------------------------------------
  // Social awareness — Nhận thức xã hội
  // ---------------------------------------------------------------------------
  {
    code: 'soa_why_others_feel',
    skill: 'social_awareness',
    caselCode: 'soa_perspective_taking',
    nameVi: 'Hiểu vì sao người khác nghĩ và cảm thấy như vậy',
    descriptionVi:
      'Bé đặt mình vào vị trí người khác để hiểu điều họ biết, họ muốn và vì sao họ phản ứng như vậy — kể cả khi điều đó khác với điều bé biết hoặc bé muốn.',
    ageMin: 5,
    ageMax: 8,
    order: 1,
    templates: [
      singleCorrect({
        title: 'Vì sao bạn ấy phản ứng như vậy?',
        needsTarget: true,
        questionFrame: 'Theo {NV1}, vì sao {NV2} lại làm như vậy?',
        pageSetup:
          'Một sự việc xảy ra với {NV2} (không biết điều {NV1} biết, bị lấy mất chỗ ngồi quen, nhận món quà không như mong đợi) và {NV2} có phản ứng thấy rõ. Lời kể cho đủ manh mối về điều {NV2} biết hoặc muốn, nhưng không giải thích thẳng lý do.',
        correctDesc: 'Lý do theo đúng điều {NV2} biết hoặc muốn, dựa trên manh mối trong lời kể.',
        distractorDesc:
          'Hai lý do hợp lý nhưng rõ là sai: một lý do theo điều {NV1} biết hoặc muốn chứ không phải của {NV2} (nhìn bằng mắt mình), và một lý do không có trong truyện. Không đánh đố, không đùa cợt.',
        hintGuidance: 'Nhắc lại điều {NV2} đã thấy, đã nói hoặc đã mong ở trang trước, không nói ra đáp án.',
        parentPrompts: [
          'Theo con, vì sao bạn trong truyện lại làm như vậy?',
          'Nếu con là bạn ấy, lúc đó con mong điều gì?',
          'Lúc con và bạn nghĩ khác nhau về một chuyện, chuyện đó là gì?',
        ],
        rationale:
          'CASEL nêu "Taking others\' perspectives" đầu tiên trong Nhận thức xã hội. Hiểu điều người khác biết/muốn (khác với mình) là năng lực nhìn từ góc người khác mà SELweb (https://edinstruments.org/instruments/selweb) đo cho trẻ K–3 bằng tình huống minh hoạ. Phương án nhiễu "nhìn bằng mắt mình" giúp phân biệt bé có thật sự đổi góc nhìn không.',
      }),
      singleCorrect({
        title: 'Bạn ấy đang mong điều gì?',
        questionFrame: '{NV1} đoán xem, bạn ấy đang mong điều gì?',
        pageSetup:
          'Có một nhân vật phụ không có tên riêng (bạn mới trong lớp, em bé hàng xóm, bà cụ ở công viên) với hành động cho thấy một mong muốn (đứng nhìn các bạn chơi, cầm món đồ ngập ngừng). Câu hỏi gọi nhân vật này bằng danh xưng chung ("bạn ấy", "em bé", "bà"). Không nói thẳng mong muốn đó.',
        correctDesc: 'Mong muốn đúng với hành động và hoàn cảnh của nhân vật phụ trong lời kể (ví dụ "được chơi cùng").',
        distractorDesc:
          'Hai mong muốn hợp lý nhưng rõ là sai: một mong muốn của chính {NV1} khác hẳn đáp án đúng, và một mong muốn trái với hành động đã kể. Không đánh đố.',
        hintGuidance: 'Nhắc lại việc nhân vật phụ đang làm ở trang trước (ví dụ "bạn ấy cứ đứng nhìn"), không nói ra đáp án.',
        parentPrompts: [
          'Theo con, bạn trong truyện đang mong điều gì? Sao con đoán vậy?',
          'Khi thấy một bạn đứng nhìn các bạn chơi, con đoán bạn ấy mong gì?',
        ],
        rationale:
          'Biến thể của "Taking others\' perspectives" (CASEL) dùng được khi truyện chỉ có một nhân vật có tên: bé suy ra mong muốn của người khác từ hành động của họ. Đây là dạng suy luận góc nhìn qua tình huống minh hoạ như SELweb.',
      }),
    ],
  },
  {
    code: 'soa_feeling_with_others',
    skill: 'social_awareness',
    caselCode: 'soa_empathy_compassion',
    nameVi: 'Cảm nhận cùng người khác',
    descriptionVi:
      'Bé nhận ra cảm xúc của người khác qua dấu hiệu và hoàn cảnh, rồi muốn làm một điều nhỏ để an ủi hoặc giúp họ.',
    ageMin: 5,
    ageMax: 8,
    order: 2,
    templates: [
      emotionPick({
        title: 'Bạn ấy đang cảm thấy thế nào?',
        needsTarget: true,
        questionFrame: '{NV1} nhìn {NV2}. {NV2} đang cảm thấy thế nào?',
        pageSetup:
          `Một sự việc xảy ra với {NV2} (làm rơi kem, được khen, bị bỏ lại) và có ít nhất hai dấu hiệu cảm xúc cụ thể của {NV2} mà {NV1} nhìn thấy. ${NO_EMOTION_WORD}`,
        hintGuidance: 'Nhắc lại dấu hiệu trên mặt hoặc cơ thể {NV2} mà {NV1} đã thấy, không nói ra đáp án.',
        parentPrompts: [
          'Bạn trong truyện thấy thế nào? Nếu là con, con sẽ thấy ra sao?',
          'Khi thấy một bạn như thế, con muốn làm gì?',
        ],
        rationale:
          'CASEL nêu "Demonstrating empathy and compassion" trong Nhận thức xã hội; bước đầu của đồng cảm là nhận ra đúng cảm xúc của người khác. Nhận diện cảm xúc người khác từ dấu hiệu trong tình huống là nội dung SELweb đo trực tiếp ở trẻ K–3 (https://edinstruments.org/instruments/selweb).',
      }),
      roleChoice({
        title: 'Thấy bạn đang buồn',
        questionFrame: 'Thấy bạn ấy như vậy, {NV1} sẽ làm gì?',
        pageSetup:
          `Một nhân vật phụ không có tên riêng (bạn cùng lớp, em bé, bà) đang buồn hoặc gặp chuyện nhỏ (ngã trầy gối, làm vỡ đồ chơi, ngồi một mình); cảm xúc gọi tên rõ. Câu hỏi gọi nhân vật này bằng danh xưng chung. ${ROLE_CHOICE_PAGE}`,
        constructiveDesc:
          'Một cử chỉ quan tâm vừa sức trẻ: lại gần hỏi "Cậu có sao không?", ngồi cạnh, đưa đồ chơi của mình, hoặc gọi người lớn tới giúp.',
        avoidantDesc: 'Nhìn một chút rồi quay đi chơi tiếp như không thấy gì.',
        impulsiveDesc: 'Buột miệng nói "Có gì đâu mà buồn!" rồi chạy đi chơi tiếp.',
        parentPrompts: [
          'Bạn nhỏ trong truyện đã làm gì khi thấy người khác buồn?',
          'Lần trước con buồn, ai đã làm con thấy dễ chịu hơn? Họ làm gì?',
        ],
        rationale:
          'Mẫu đo phần "compassion" của "Demonstrating empathy and compassion" (CASEL): từ nhận ra cảm xúc của người khác đến hành động quan tâm. Ba phương án là phản ứng thật của trẻ khi thấy bạn buồn; điểm theo mức thể hiện sự quan tâm.',
      }),
    ],
  },
  {
    code: 'soa_kind_words',
    skill: 'social_awareness',
    caselCode: 'soa_concern_for_feelings',
    nameVi: 'Để ý cảm xúc của người khác khi nói và làm',
    descriptionVi:
      'Bé nhận ra lời nói, việc làm của mình ảnh hưởng tới cảm xúc người khác, và chọn cách nói, cách làm để người kia dễ chịu hơn.',
    ageMin: 5,
    ageMax: 8,
    order: 3,
    templates: [
      emotionPick({
        title: 'Việc mình làm khiến bạn thấy thế nào?',
        needsTarget: true,
        questionFrame: 'Khi {NV1} làm vậy, {NV2} cảm thấy thế nào?',
        pageSetup:
          `{NV1} vừa nói hoặc làm một việc ảnh hưởng đến {NV2} (quên rủ {NV2} chơi, khen bức vẽ của {NV2}, vô tình làm đổ tháp của {NV2}); {NV2} có dấu hiệu cảm xúc cụ thể. ${NO_EMOTION_WORD}`,
        hintGuidance: 'Nhắc lại việc {NV1} vừa làm và phản ứng của {NV2}, không nói ra đáp án.',
        parentPrompts: [
          'Việc bạn nhỏ trong truyện làm khiến bạn kia thấy thế nào?',
          'Câu nói nào của người khác từng làm con thấy vui cả ngày?',
        ],
        rationale:
          'CASEL nêu "Showing concern for the feelings of others" trong Nhận thức xã hội. Câu hỏi yêu cầu bé nối hành động của nhân vật chính với cảm xúc của người khác — điều kiện để biết quan tâm tới cảm xúc của họ.',
      }),
      singleCorrect({
        title: 'Nói gì để bạn dễ chịu hơn?',
        questionFrame: '{NV1} có thể nói gì để bạn ấy dễ chịu hơn?',
        pageSetup:
          'Một nhân vật phụ không có tên riêng (bạn mới, em bé, bà) đang buồn, ngượng hoặc lo vì một chuyện nhỏ (vẽ chưa đẹp, làm đổ nước, chưa quen ai); cảm xúc gọi tên rõ. Câu hỏi gọi nhân vật này bằng danh xưng chung.',
        correctDesc:
          'Một câu nói ân cần, cụ thể, đúng hoàn cảnh (ví dụ "Không sao đâu, tớ giúp cậu lau nhé", "Cậu chơi cùng tớ không?").',
        distractorDesc:
          'Hai câu trẻ có thể buột miệng nói nhưng rõ là không làm bạn ấy dễ chịu hơn: một câu nói thật nhưng làm bạn buồn thêm ("Bức vẽ xấu thật"), và một câu không liên quan đến chuyện của bạn ấy. Không chế giễu.',
        hintGuidance: 'Nhắc lại bạn ấy đang lo hay buồn vì chuyện gì ở trang trước, không nói ra đáp án.',
        parentPrompts: [
          'Nếu con là bạn nhỏ trong truyện, con sẽ nói gì với bạn kia?',
          'Khi con buồn, con thích được nghe câu gì nhất?',
          'Hôm nay con muốn nói câu gì để làm ai đó vui?',
        ],
        rationale:
          'Mẫu đo "Showing concern for the feelings of others" (CASEL) ở mức lựa chọn lời nói: bé phân biệt câu quan tâm tới cảm xúc người nghe với câu chỉ đúng sự thật hoặc không liên quan.',
      }),
    ],
  },
  {
    code: 'soa_saying_thanks',
    skill: 'social_awareness',
    caselCode: 'soa_gratitude',
    nameVi: 'Nhận ra điều tốt và biết cảm ơn',
    descriptionVi:
      'Bé nhận ra điều tốt người khác làm cho mình (giúp đỡ, chia sẻ, chăm sóc) và bày tỏ lòng biết ơn bằng lời hoặc bằng một việc nhỏ.',
    ageMin: 5,
    ageMax: 8,
    order: 4,
    templates: [
      singleCorrect({
        title: 'Điều gì làm nhân vật chính thấy ấm lòng?',
        questionFrame: 'Điều gì làm {NV1} thấy ấm lòng hôm nay?',
        pageSetup:
          'Kể một việc tốt người khác làm cho {NV1} (bà để phần bánh, bạn cho mượn bút, anh dắt qua chỗ đông người) xen với vài sự việc thường ngày khác. Tả niềm vui ấm áp của {NV1} nhưng không nói thẳng sự việc nào làm {NV1} thấy ấm lòng.',
        correctDesc: 'Đúng việc tốt người khác đã làm cho {NV1} trong lời kể.',
        distractorDesc:
          'Hai sự việc khác có trong ngày nhưng không phải ai đó làm điều tốt cho {NV1}: một việc {NV1} tự làm, và một chuyện thường ngày (trời nắng, đi học về).',
        hintGuidance: 'Nhắc lại người đã ở cạnh {NV1} trong trang trước, không nói ra đáp án.',
        parentPrompts: [
          'Trong truyện, ai đã làm điều tốt cho bạn nhỏ?',
          'Hôm nay ai đã làm điều tốt cho con? Mình có thể cảm ơn người đó thế nào?',
        ],
        rationale:
          'CASEL nêu "Understanding and expressing gratitude" trong Nhận thức xã hội. Câu hỏi đo phần "understanding": bé nhận ra điều tốt mà người khác đã làm cho mình, phân biệt với những sự việc khác trong ngày.',
      }),
      roleChoice({
        title: 'Khi được người khác giúp',
        questionFrame: 'Được giúp rồi, {NV1} sẽ làm gì?',
        pageSetup:
          `Một người khác vừa giúp {NV1} một việc cụ thể (bạn cho mượn bút màu, bà khâu lại áo gấu bông, chú bảo vệ nhặt giúp mũ). {NV1} vui; cảm xúc gọi tên rõ. ${ROLE_CHOICE_PAGE}`,
        constructiveDesc:
          'Cảm ơn cụ thể bằng lời ("Cảm ơn bà khâu áo cho gấu ạ") hoặc bằng một việc nhỏ (vẽ tặng, giúp lại).',
        avoidantDesc: 'Nhận lấy rồi chạy đi vì ngại, không nói gì.',
        impulsiveDesc: 'Đòi thêm ngay ("Cho tớ cái màu đỏ nữa!") mà quên nói cảm ơn.',
        parentPrompts: [
          'Bạn nhỏ trong truyện đã cảm ơn như thế nào?',
          'Ngoài nói "cảm ơn", con có thể làm gì để người ta biết con biết ơn?',
        ],
        rationale:
          'Mẫu đo phần "expressing" của "Understanding and expressing gratitude" (CASEL): bé chọn cách bày tỏ lòng biết ơn khi được giúp. Phương án né tránh (ngại không nói) được nửa điểm vì không làm ai buồn nhưng lòng biết ơn chưa được bày tỏ.',
      }),
    ],
  },
  {
    code: 'soa_seeing_strengths',
    skill: 'social_awareness',
    caselCode: 'soa_strengths_in_others',
    nameVi: 'Nhận ra điểm hay của người khác',
    descriptionVi:
      'Bé nhận ra điều người khác làm tốt hoặc điểm đáng quý của họ (khéo tay, tốt bụng, kiên nhẫn) mà không so sánh ai hơn ai.',
    ageMin: 5,
    ageMax: 8,
    order: 5,
    templates: [
      singleCorrect({
        title: 'Bạn ấy giỏi ở điều gì?',
        needsTarget: true,
        questionFrame: '{NV1} thấy {NV2} giỏi ở điều gì?',
        pageSetup:
          '{NV2} làm tốt một việc cụ thể trước mắt {NV1} (gấp máy bay giấy bay xa, kiên nhẫn dỗ em bé, nhớ đường về nhà). Tả việc làm và kết quả, không nói thẳng điểm mạnh, không so sánh ai giỏi hơn ai.',
        correctDesc: 'Đúng điểm mạnh {NV2} vừa thể hiện trong lời kể, nói bằng lời trẻ con.',
        distractorDesc:
          'Hai điểm mạnh hợp lý nhưng không phải điều lời kể cho thấy ở {NV2}: một điểm mạnh của chính {NV1}, và một điểm mạnh không có trong truyện.',
        hintGuidance: 'Nhắc lại việc {NV2} vừa làm ở trang trước, không nói ra đáp án.',
        parentPrompts: [
          'Trong truyện, bạn nào làm giỏi việc gì?',
          'Bạn thân của con giỏi điều gì? Con muốn nói gì với bạn ấy về điều đó?',
        ],
        rationale:
          'CASEL nêu "Recognizing strengths in others" trong Nhận thức xã hội. Câu hỏi đo việc bé nhận ra điểm mạnh của người khác từ hành động của họ; phương án nhiễu "điểm mạnh của chính mình" kiểm tra bé có nhìn vào người kia hay không. Truyện không so sánh nhân vật (nguyên tắc nội dung số 6).',
      }),
      singleCorrect({
        title: 'Điểm đáng quý của người giúp mình',
        questionFrame: '{NV1} thấy người ấy có điểm gì đáng quý?',
        pageSetup:
          'Một nhân vật phụ không có tên riêng (bà, cô giáo, bạn cùng bàn, chú bán hàng) làm một việc thể hiện điểm đáng quý (kiên nhẫn dạy {NV1} buộc dây giày, khéo tay sửa đồ chơi). Câu hỏi gọi nhân vật này bằng danh xưng chung. Không nói thẳng điểm đáng quý, không so sánh.',
        correctDesc: 'Đúng điểm đáng quý mà hành động của nhân vật phụ cho thấy (kiên nhẫn, khéo tay, tốt bụng…).',
        distractorDesc:
          'Hai điểm hợp lý nhưng không phải điều lời kể cho thấy: một điều về ngoại hình (áo đẹp), và một điểm mạnh không có trong truyện.',
        hintGuidance: 'Nhắc lại người ấy đã làm gì cho {NV1} ở trang trước, không nói ra đáp án.',
        parentPrompts: [
          'Người trong truyện có điểm gì làm con quý?',
          'Trong nhà mình, mỗi người giỏi một việc gì nhỉ?',
        ],
        rationale:
          'Biến thể của "Recognizing strengths in others" (CASEL) cho truyện chỉ có một nhân vật có tên: bé nhận ra phẩm chất của người khác qua việc họ làm, phân biệt với vẻ bề ngoài.',
      }),
    ],
  },

  // ---------------------------------------------------------------------------
  // Relationship skills — Kỹ năng quan hệ
  // ---------------------------------------------------------------------------
  {
    code: 'rs_saying_what_i_need',
    skill: 'relationship_skills',
    caselCode: 'rs_communicating',
    nameVi: 'Nói rõ điều mình muốn',
    descriptionVi:
      'Bé nói rõ, nhẹ nhàng điều mình muốn hoặc cảm thấy ("Tớ muốn chơi cùng", "Tớ chưa chơi xong") và lắng nghe người kia trả lời, thay vì im lặng hay giành giật.',
    ageMin: 5,
    ageMax: 8,
    order: 1,
    templates: [
      roleChoice({
        title: 'Muốn điều gì thì nói thế nào?',
        questionFrame: '{NV1} sẽ nói điều mình muốn như thế nào?',
        pageSetup:
          `{NV1} muốn một điều nhỏ từ người khác (được chơi tiếp, được đến lượt, muốn bạn trả đồ chơi, muốn bạn đừng cầm bức vẽ). Điều {NV1} muốn và cảm xúc của {NV1} được kể rõ. ${ROLE_CHOICE_PAGE}`,
        constructiveDesc:
          'Nói rõ và nhẹ nhàng điều mình muốn bằng một câu ngắn ("Tớ chưa chơi xong, cậu đợi tớ một chút nhé") rồi nghe bạn trả lời.',
        avoidantDesc: 'Không nói gì, giữ trong lòng và ngồi buồn.',
        impulsiveDesc: 'Hét lên "Của tớ!" hoặc giật lại món đồ thay cho lời nói (không đánh, không xô ngã).',
        parentPrompts: [
          'Bạn nhỏ trong truyện đã nói điều mình muốn thế nào?',
          'Khi con muốn bạn trả đồ chơi, con có thể nói câu gì?',
          'Con muốn tập nói câu đó với ai trước?',
        ],
        rationale:
          'CASEL nêu "Communicating effectively" đầu tiên trong Kỹ năng quan hệ. Ở trẻ 5–8 tuổi, giao tiếp hiệu quả là nói rõ nhu cầu bằng lời thay vì im lặng hay dùng hành động; ba phương án tương ứng ba cách trẻ thường làm.',
      }),
    ],
  },
  {
    code: 'rs_making_friends',
    skill: 'relationship_skills',
    caselCode: 'rs_positive_relationships',
    nameVi: 'Làm quen và chơi cùng bạn',
    descriptionVi:
      'Bé biết cách làm quen, xin vào chơi hoặc rủ bạn chơi cùng, và giữ cho cuộc chơi vui với mọi người.',
    ageMin: 5,
    ageMax: 8,
    order: 2,
    templates: [
      roleChoice({
        title: 'Muốn chơi cùng các bạn',
        questionFrame: '{NV1} muốn chơi cùng các bạn. {NV1} sẽ làm gì?',
        pageSetup:
          `{NV1} thấy một nhóm bạn đang chơi một trò vui (xếp hình, nhảy lò cò, đá cầu) và muốn được chơi cùng; cảm xúc háo hức hoặc ngại ngùng gọi tên rõ. Các bạn trong nhóm có thể không có tên riêng. ${ROLE_CHOICE_PAGE}`,
        constructiveDesc:
          'Lại gần, chào và hỏi "Cho tớ chơi với được không?" hoặc rủ một bạn chơi cùng mình.',
        avoidantDesc: 'Đứng xa nhìn rồi về chơi một mình.',
        impulsiveDesc: 'Chạy thẳng vào giữa trò chơi và cầm lấy đồ chơi của nhóm mà chưa hỏi.',
        parentPrompts: [
          'Bạn nhỏ trong truyện đã làm quen với các bạn thế nào?',
          'Ở lớp, khi muốn chơi cùng các bạn, con thường làm gì?',
        ],
        rationale:
          'CASEL nêu "Developing positive relationships" trong Kỹ năng quan hệ. Bắt đầu một mối quan hệ (xin vào chơi, rủ chơi) là kỹ năng then chốt ở lứa mẫu giáo – tiểu học; ba phương án là ba cách tiếp cận nhóm bạn thường gặp.',
      }),
    ],
  },
  {
    code: 'rs_playing_together',
    skill: 'relationship_skills',
    caselCode: 'rs_teamwork',
    nameVi: 'Cùng chơi, thay phiên, chia sẻ',
    descriptionVi:
      'Bé cùng bạn tìm cách chơi chung khi chỉ có một món đồ hoặc mỗi người một ý: thay phiên, chia việc, ghép ý để ai cũng được chơi.',
    ageMin: 5,
    ageMax: 8,
    order: 3,
    templates: [
      roleChoice({
        title: 'Cả nhóm cùng muốn một món',
        questionFrame: '{NV1} và bạn cùng muốn một thứ. {NV1} sẽ làm gì?',
        pageSetup:
          `{NV1} đang chơi cùng một hay vài bạn thì gặp khó: chỉ có một món đồ mà ai cũng muốn (một chiếc xe, một hộp màu), hoặc mỗi người muốn chơi một kiểu. Các bạn có thể không có tên riêng. ${ROLE_CHOICE_PAGE}`,
        constructiveDesc:
          'Đề nghị một cách cùng chơi: thay phiên ("Mỗi bạn chơi một lúc nhé"), chia việc, hoặc ghép hai ý thành một trò.',
        avoidantDesc: 'Bỏ ra một góc chơi một mình cho xong chuyện.',
        impulsiveDesc: 'Giành lấy món đồ về phía mình để chơi theo ý mình (không đánh, không xô bạn).',
        parentPrompts: [
          'Trong truyện, các bạn đã làm thế nào để ai cũng được chơi?',
          'Ở nhà, khi con và anh chị em cùng muốn một món đồ, mình có thể làm gì?',
        ],
        rationale:
          'CASEL nêu "Practicing teamwork and collaborative problem-solving" trong Kỹ năng quan hệ. Tình huống "một món đồ, nhiều người muốn" là bài toán hợp tác điển hình của trẻ nhỏ; phương án xây dựng là cách giải quyết cùng nhau, khác với rút lui hoặc giành phần.',
      }),
      singleCorrect({
        title: 'Cách nào để cả nhóm cùng chơi vui?',
        questionFrame: 'Cách nào giúp {NV1} và các bạn cùng chơi vui?',
        pageSetup:
          '{NV1} và các bạn (có thể không có tên riêng) cùng muốn chơi một món đồ hoặc một trò, đang chưa biết làm sao. Tả rõ có bao nhiêu đồ, bao nhiêu bạn, mỗi bạn muốn gì.',
        correctDesc: 'Một cách chơi chung mà ai cũng được chơi (thay phiên theo lượt, chia đồ, chơi trò cần cả nhóm).',
        distractorDesc:
          'Hai cách trẻ có thể nghĩ ra nhưng rõ là không giúp cả nhóm cùng vui: một cách chỉ một bạn được chơi, và một cách không giải quyết gì (ai cũng đứng chờ).',
        hintGuidance: 'Nhắc lại có mấy món đồ và mấy bạn cùng muốn chơi, không nói ra đáp án.',
        parentPrompts: [
          'Các bạn trong truyện đã chơi chung như thế nào?',
          'Con thích cách chơi thay phiên hay chơi chung cùng lúc hơn? Vì sao?',
        ],
        rationale:
          'Mẫu đo phần "collaborative problem-solving" của kỹ năng CASEL "Practicing teamwork and collaborative problem-solving": bé nhận ra giải pháp có lợi cho cả nhóm. Cách đo giải quyết vấn đề xã hội qua tình huống minh hoạ giống SELweb (https://edinstruments.org/instruments/selweb).',
      }),
    ],
  },
  {
    code: 'rs_making_up',
    skill: 'relationship_skills',
    caselCode: 'rs_resolving_conflicts',
    nameVi: 'Làm lành khi bất đồng',
    descriptionVi:
      'Khi cãi nhau với bạn hay anh chị em, bé dừng lại, nói cảm xúc của mình, nghe người kia, và tìm cách làm lành (xin lỗi, thay phiên, cùng sửa).',
    ageMin: 5,
    ageMax: 8,
    order: 4,
    templates: [
      roleChoice({
        title: 'Hai bạn đang cãi nhau',
        needsTarget: true,
        questionFrame: '{NV1} và {NV2} đang cãi nhau. {NV1} sẽ làm gì?',
        pageSetup:
          `{NV1} và {NV2} bất đồng về một chuyện nhỏ (ai được chơi trước, ai làm đổ tháp, chọn trò gì). Cả hai đều có lý do riêng và cảm xúc gọi tên rõ; không ai là "người xấu". ${ROLE_CHOICE_PAGE}`,
        constructiveDesc:
          'Dừng lại, nói cảm xúc của mình ("Tớ đang bực"), nghe {NV2} nói, rồi đề nghị một cách cả hai cùng chịu (thay phiên, cùng xếp lại, xin lỗi).',
        avoidantDesc: 'Bỏ đi chỗ khác và không chơi với {NV2} nữa.',
        impulsiveDesc: 'Cãi to hơn hoặc giật lại món đồ (không đánh, không xô ngã).',
        parentPrompts: [
          'Hai bạn trong truyện đã làm lành thế nào?',
          'Lần gần nhất con giận bạn, sau đó hai bạn làm lành ra sao?',
          'Khi muốn làm lành, con có thể nói câu gì?',
        ],
        rationale:
          'CASEL nêu "Resolving conflicts constructively" trong Kỹ năng quan hệ. Ba phương án là ba cách trẻ phản ứng khi xung đột: giải quyết cùng nhau, rút lui (giảm căng thẳng nhưng chưa giải quyết — 0,5), leo thang (0). Đây là dạng giải quyết vấn đề xã hội qua tình huống mà SELweb đo ở trẻ K–3.',
      }),
      roleChoice({
        title: 'Bất đồng với một bạn',
        questionFrame: '{NV1} và bạn ấy không đồng ý với nhau. {NV1} sẽ làm gì?',
        pageSetup:
          `{NV1} bất đồng với một nhân vật phụ không có tên riêng (bạn cùng lớp, em họ) về một chuyện nhỏ; cả hai có lý do riêng, cảm xúc gọi tên rõ. Câu hỏi gọi nhân vật này bằng danh xưng chung. ${ROLE_CHOICE_PAGE}`,
        constructiveDesc:
          'Nói cảm xúc của mình, nghe bạn ấy nói, rồi đề nghị một cách cả hai cùng chịu (thay phiên, chia đôi, chơi trò khác cùng nhau).',
        avoidantDesc: 'Im lặng bỏ đi, tự chơi một mình.',
        impulsiveDesc: 'Nói to "Tớ không chơi với cậu nữa!" (không đánh, không xô).',
        parentPrompts: [
          'Khi bạn nhỏ trong truyện không đồng ý với bạn, bạn ấy đã làm gì?',
          'Con nghĩ hai người nghĩ khác nhau thì có thể cùng làm gì?',
        ],
        rationale:
          'Biến thể của "Resolving conflicts constructively" (CASEL) dùng được cho truyện chỉ có một nhân vật có tên; điểm theo vai như mẫu chính.',
      }),
    ],
  },
  {
    code: 'rs_saying_no',
    skill: 'relationship_skills',
    caselCode: 'rs_resisting_pressure',
    nameVi: 'Dám nói "không" khi bạn rủ làm điều chưa ổn',
    descriptionVi:
      'Bé từ chối nhẹ nhàng nhưng rõ ràng khi bạn rủ làm điều chưa ổn (trêu bạn, lấy đồ chưa xin phép), có thể rủ làm việc khác hoặc nói với người lớn.',
    ageMin: 5,
    ageMax: 8,
    order: 5,
    templates: [
      roleChoice({
        title: 'Bạn rủ làm điều chưa ổn',
        questionFrame: 'Các bạn rủ {NV1} làm theo. {NV1} sẽ làm gì?',
        pageSetup:
          `Một hoặc vài bạn (có thể không có tên riêng) rủ {NV1} làm một việc nhỏ chưa ổn nhưng không nguy hiểm (trêu chọc một bạn khác, lấy kẹo trong tủ khi chưa xin, giấu dép của bạn). {NV1} lưỡng lự; cảm xúc gọi tên rõ. Không ai bị phạt. ${ROLE_CHOICE_PAGE}`,
        constructiveDesc:
          'Nói "Tớ không làm đâu" một cách bình tĩnh, rủ các bạn làm việc khác, hoặc nói với người lớn.',
        avoidantDesc: 'Lặng lẽ bỏ đi chỗ khác, không nói gì với các bạn.',
        impulsiveDesc: 'Làm theo ngay cho các bạn khỏi chê mình.',
        parentPrompts: [
          'Khi các bạn rủ, bạn nhỏ trong truyện đã làm gì?',
          'Nếu có bạn rủ con làm điều con thấy chưa ổn, con có thể nói câu gì?',
          'Con sẽ nói câu "không" thế nào cho thật bình tĩnh?',
        ],
        rationale:
          'CASEL nêu "Resisting negative social pressure" trong Kỹ năng quan hệ. Phương án xây dựng là từ chối rõ ràng và có lối ra (rủ việc khác, tìm người lớn); rút lui im lặng tránh được việc chưa ổn nhưng không giữ được quan hệ (0,5); làm theo vì sợ bị chê là đầu hàng áp lực (0).',
      }),
    ],
  },
  {
    code: 'rs_asking_offering_help',
    skill: 'relationship_skills',
    caselCode: 'rs_support_help',
    nameVi: 'Biết nhờ giúp và giúp người khác',
    descriptionVi:
      'Bé biết nhờ người lớn hoặc bạn giúp khi gặp việc chưa tự làm được, và biết hỏi, giúp người khác khi họ cần.',
    ageMin: 5,
    ageMax: 8,
    order: 6,
    templates: [
      roleChoice({
        title: 'Khi chưa tự làm được',
        questionFrame: '{NV1} chưa tự làm được việc này. {NV1} sẽ làm gì?',
        pageSetup:
          `{NV1} gặp một việc quá sức hoặc chưa biết làm (với không tới kệ cao, mở nắp hộp quá chặt, lạc bạn trong siêu thị khi người lớn ở gần quầy). Có người lớn hoặc bạn ở gần để nhờ. ${ROLE_CHOICE_PAGE}`,
        constructiveDesc:
          'Nhờ giúp bằng lời rõ ràng: "Bà ơi, bà giúp con với ạ", "Cậu giữ hộ tớ một bên nhé".',
        avoidantDesc: 'Cố làm một mình mãi rồi bỏ dở, không nói với ai.',
        impulsiveDesc: 'Khóc to và đòi người khác làm hộ ngay (không trèo lên cao, không làm gì nguy hiểm).',
        parentPrompts: [
          'Bạn nhỏ trong truyện đã nhờ giúp như thế nào?',
          'Khi gặp việc khó, con thường nhờ ai? Con nói thế nào?',
        ],
        rationale:
          'CASEL nêu "Seeking or offering support and help when needed" trong Kỹ năng quan hệ. Mẫu đo phần "seeking": nhờ giúp bằng lời là xây dựng (1); cố một mình rồi bỏ dở được nửa điểm (0,5) vì không gây hại nhưng không tìm sự hỗ trợ; bùng nổ đòi làm hộ được 0.',
      }),
      roleChoice({
        title: 'Khi thấy người khác cần giúp',
        questionFrame: 'Bạn ấy đang cần giúp. {NV1} sẽ làm gì?',
        pageSetup:
          `Một nhân vật phụ không có tên riêng (bạn cùng lớp, em bé, bà) đang loay hoay với một việc nhỏ (làm rơi bút chì, xách túi nặng, chưa tìm thấy dép). Câu hỏi gọi nhân vật này bằng danh xưng chung. ${ROLE_CHOICE_PAGE}`,
        constructiveDesc: 'Hỏi "Cậu có cần tớ giúp không?" rồi giúp một việc vừa sức, hoặc gọi người lớn tới.',
        avoidantDesc: 'Đi qua và nghĩ chắc sẽ có người khác giúp.',
        impulsiveDesc: 'Giằng lấy việc để làm hộ ngay mà không hỏi bạn ấy có muốn không.',
        parentPrompts: [
          'Bạn nhỏ trong truyện đã giúp người khác thế nào?',
          'Hôm nay con đã giúp ai một việc gì? Lúc đó con thấy thế nào?',
        ],
        rationale:
          'Mẫu đo phần "offering" của "Seeking or offering support and help when needed" (CASEL): hỏi trước rồi giúp vừa sức là xây dựng; đi qua (0,5) không gây hại nhưng bỏ lỡ việc giúp; giằng làm hộ không hỏi là hấp tấp (0).',
      }),
    ],
  },

  // ---------------------------------------------------------------------------
  // Responsible decision-making — Ra quyết định có trách nhiệm
  // ---------------------------------------------------------------------------
  {
    code: 'rdm_finding_solutions',
    skill: 'responsible_decision_making',
    caselCode: 'rdm_identifying_solutions',
    nameVi: 'Nghĩ ra cách giải quyết',
    descriptionVi:
      'Bé nhận ra vấn đề và chọn được một cách giải quyết làm được ngay, có lợi cho mình và cho người khác.',
    ageMin: 5,
    ageMax: 8,
    order: 1,
    templates: [
      singleCorrect({
        title: 'Cách nào giải quyết được chuyện này?',
        questionFrame: 'Cách nào giúp {NV1} giải quyết chuyện này?',
        pageSetup:
          '{NV1} gặp một vấn đề nhỏ đời thường cần giải quyết (đổ nước ra bàn, quên mang bút màu, hai người cùng cần một chỗ ngồi). Tả rõ vấn đề và những gì {NV1} có trong tay.',
        correctDesc: 'Một cách giải quyết hợp lý, trẻ làm được ngay, có lợi cho mọi người (lấy khăn lau, hỏi mượn bạn, ngồi chung).',
        distractorDesc:
          'Hai cách trẻ có thể nghĩ tới nhưng rõ là không ổn: một cách không giải quyết được vấn đề (chờ cho nó tự hết), và một cách được việc cho mình nhưng làm người khác thiệt (lấy bút của bạn khi bạn đang dùng).',
        hintGuidance: 'Nhắc lại vấn đề và những thứ {NV1} đang có trong tay, không nói ra đáp án.',
        parentPrompts: [
          'Bạn nhỏ trong truyện đã giải quyết chuyện đó thế nào? Con còn nghĩ ra cách nào khác?',
          'Nếu con gặp chuyện giống vậy, con sẽ làm gì trước tiên?',
        ],
        rationale:
          'CASEL nêu "Identifying solutions for personal and social problems" trong Ra quyết định có trách nhiệm. Bé chọn giải pháp vừa giải quyết được vấn đề vừa không làm người khác thiệt — giải quyết vấn đề xã hội qua tình huống minh hoạ là nội dung SELweb đo ở trẻ K–3 (https://edinstruments.org/instruments/selweb).',
      }),
      roleChoice({
        title: 'Đứng trước một vấn đề',
        questionFrame: '{NV1} sẽ làm gì để giải quyết chuyện này?',
        pageSetup:
          `Cao trào của truyện: {NV1} đứng trước một vấn đề nhỏ cần làm gì đó (làm hỏng đồ của em, lỡ hẹn với bạn, đồ chơi bị kẹt dưới gầm ghế). Cảm xúc gọi tên rõ. ${ROLE_CHOICE_PAGE}`,
        constructiveDesc:
          'Một cách giải quyết cụ thể, làm được ngay, có nghĩ tới người khác (nói thật và cùng sửa, xin lỗi rồi hẹn lại, nhờ người lớn lấy giúp).',
        avoidantDesc: 'Để đó, làm như không có chuyện gì.',
        impulsiveDesc: 'Làm vội theo cách đầu tiên nghĩ ra mà chưa tính (giật mạnh, nói dỗi), không nguy hiểm.',
        parentPrompts: [
          'Bạn nhỏ trong truyện đã làm gì để giải quyết chuyện đó?',
          'Lần sau gặp chuyện như vậy, con muốn thử cách nào?',
        ],
        rationale:
          'Mẫu "problem solving" theo kỹ năng CASEL "Identifying solutions for personal and social problems": ba phương án là ba cách trẻ đối mặt với vấn đề — giải quyết (1), né tránh (0,5), hành động vội (0). Điểm theo mẫu, AI không chọn vai.',
      }),
    ],
  },
  {
    code: 'rdm_what_happens_next',
    skill: 'responsible_decision_making',
    caselCode: 'rdm_anticipating_consequences',
    nameVi: 'Đoán trước điều sẽ xảy ra',
    descriptionVi:
      'Bé đoán được hệ quả gần, tự nhiên của một việc làm và dùng điều đó để chọn cách làm (ví dụ nói thật khi lỡ làm hỏng đồ thì mọi người cùng sửa được).',
    ageMin: 5,
    ageMax: 8,
    order: 2,
    templates: [
      singleCorrect({
        title: 'Nếu làm vậy thì chuyện gì có thể xảy ra?',
        questionFrame: 'Nếu {NV1} làm vậy, chuyện gì có thể xảy ra?',
        pageSetup:
          '{NV1} đang định làm một việc (chạy nhanh trong nhà khi sàn ướt, để bánh ngoài trời gần đàn kiến, giấu chiếc cốc bị mẻ). Lời kể có đủ chi tiết để đoán hệ quả gần và tự nhiên; không có gì đáng sợ hay nguy hiểm thật xảy ra.',
        correctDesc: 'Hệ quả gần, tự nhiên, hợp lý với chi tiết trong lời kể (trượt chân ngã nhẹ, kiến bò vào bánh, mẹ tìm mãi không thấy cốc).',
        distractorDesc:
          'Hai hệ quả rõ là sai: một hệ quả kiểu phép màu hoặc phóng đại, và một điều không liên quan đến việc {NV1} làm. Không đáng sợ, không mang tính trừng phạt.',
        hintGuidance: 'Nhắc lại chi tiết trong lời kể giúp đoán điều sẽ xảy ra (ví dụ "sàn nhà còn ướt"), không nói ra đáp án.',
        parentPrompts: [
          'Theo con, nếu bạn nhỏ trong truyện làm vậy thì chuyện gì sẽ xảy ra?',
          'Lần gần nhất con đoán trước được chuyện sẽ xảy ra là khi nào?',
        ],
        rationale:
          'CASEL nêu "Anticipating and evaluating the consequences of one\'s actions" trong Ra quyết định có trách nhiệm. Câu hỏi đo phần "anticipating": bé đoán được hệ quả gần và tự nhiên từ các chi tiết trong tình huống, phân biệt với hệ quả phóng đại hoặc không liên quan.',
      }),
      roleChoice({
        title: 'Sau khi lỡ làm hỏng đồ',
        questionFrame: '{NV1} lỡ làm hỏng đồ. {NV1} sẽ làm gì tiếp?',
        pageSetup:
          `{NV1} vô tình làm hỏng một món đồ trong nhà (làm vỡ bình hoa khi người lớn ở phòng bên, làm rách sách của anh). Không ai bị thương; nếu có mảnh vỡ thì {NV1} đứng xa, không tự nhặt. Người lớn trong truyện sẽ phản ứng bình tĩnh. ${ROLE_CHOICE_PAGE}`,
        constructiveDesc: 'Nói thật với người lớn ("Con lỡ làm vỡ ạ") và xin cùng sửa hoặc dọn phần an toàn.',
        avoidantDesc: 'Đứng im lo lắng, chưa dám nói với ai.',
        impulsiveDesc: 'Vội nói "Không phải con!" hoặc đổ cho con mèo.',
        parentPrompts: [
          'Bạn nhỏ trong truyện đã làm gì sau khi lỡ làm hỏng đồ? Sau đó mọi người thấy thế nào?',
          'Khi ai đó lỡ làm hỏng đồ, cả nhà mình có thể cùng làm gì?',
          'Điều gì giúp một bạn nhỏ dám kể thật với bố mẹ?',
        ],
        rationale:
          'Mẫu đo phần "evaluating" của "Anticipating and evaluating the consequences of one\'s actions" (CASEL): bé cân nhắc hệ quả của từng cách phản ứng sau khi lỡ làm hỏng đồ. Nói thật để cùng sửa là xây dựng (1); giấu đi (0,5) tránh đối mặt nhưng không làm ai thiệt ngay; chối hoặc đổ cho người khác (0). Truyện không có hình phạt (nguyên tắc nội dung số 2).',
      }),
    ],
  },
  {
    code: 'rdm_curious_mind',
    skill: 'responsible_decision_making',
    caselCode: 'rdm_curiosity_open_mind',
    nameVi: 'Tò mò và cởi mở với điều mới',
    descriptionVi:
      'Bé muốn tìm hiểu điều mới lạ và sẵn lòng nghe, thử ý kiến hay cách làm khác của người khác trước khi quyết định.',
    ageMin: 5,
    ageMax: 8,
    order: 3,
    templates: [
      roleChoice({
        title: 'Gặp điều mới lạ',
        questionFrame: 'Gặp điều mới lạ, {NV1} sẽ làm gì?',
        pageSetup:
          `{NV1} gặp một điều mới, an toàn (món ăn quê ngoại chưa ăn bao giờ, trò chơi dân gian bạn mới chỉ, một cách xếp hình khác cách quen thuộc). Cảm xúc tò mò xen ngập ngừng gọi tên rõ. ${ROLE_CHOICE_PAGE}`,
        constructiveDesc: 'Hỏi thêm, quan sát hoặc thử một chút rồi mới nói mình thấy thế nào.',
        avoidantDesc: 'Lắc đầu không thử, quay về cái mình đã quen.',
        impulsiveDesc: 'Chê ngay "Kỳ quá, chẳng hay đâu!" khi chưa tìm hiểu.',
        parentPrompts: [
          'Trong truyện có điều gì mới lạ? Con muốn thử điều gì trong đó?',
          'Gần đây con đã thử điều gì mới? Con thấy thế nào?',
        ],
        rationale:
          'CASEL nêu "Demonstrating curiosity and open-mindedness" trong Ra quyết định có trách nhiệm: tìm hiểu trước khi phán đoán. Ba phương án tương ứng tìm hiểu (1), né điều mới (0,5), và phán xét vội (0).',
      }),
    ],
  },
  {
    code: 'rdm_helping_out',
    skill: 'responsible_decision_making',
    caselCode: 'rdm_reflecting_role',
    nameVi: 'Góp phần nhỏ cho gia đình và lớp học',
    descriptionVi:
      'Bé nhận ra việc mình làm có ích cho cả nhà, cả lớp, và tự nhận một việc nhỏ vừa sức để góp phần.',
    ageMin: 5,
    ageMax: 8,
    order: 4,
    templates: [
      roleChoice({
        title: 'Mọi người đang bận',
        questionFrame: 'Mọi người đang bận. {NV1} có thể làm gì?',
        pageSetup:
          `Cả nhà hoặc cả lớp đang bận một việc chung (dọn nhà đón Tết, chuẩn bị bữa cơm, dọn lớp cuối giờ); có những việc nhỏ trẻ làm được. ${ROLE_CHOICE_PAGE}`,
        constructiveDesc:
          'Tự nhận một việc vừa sức (xếp dép, lau bàn, bày bát đũa nhựa) hoặc hỏi "Con giúp được gì ạ?".',
        avoidantDesc: 'Tiếp tục chơi và nghĩ việc đó là của người lớn.',
        impulsiveDesc: 'Chạy quanh nhà rủ mọi người bỏ việc ra chơi cùng mình ngay.',
        parentPrompts: [
          'Bạn nhỏ trong truyện đã góp phần gì cho cả nhà?',
          'Trong nhà mình, việc nào con muốn nhận làm hằng ngày?',
        ],
        rationale:
          'CASEL nêu "Reflecting on one\'s role to promote personal, family, and community well-being" trong Ra quyết định có trách nhiệm. Với trẻ 5–8 tuổi, vai của mình trong gia đình/lớp học thể hiện qua việc tự nhận một phần việc chung; ba phương án là góp phần (1), đứng ngoài (0,5), làm vội không hỏi (0).',
      }),
      singleCorrect({
        title: 'Việc mình làm giúp gì cho mọi người?',
        questionFrame: 'Việc {NV1} vừa làm giúp gì cho mọi người?',
        pageSetup:
          '{NV1} vừa làm xong một việc nhỏ cho gia đình hoặc lớp (xếp dép gọn gàng, tưới cây của lớp, bày bát đũa). Trang trước cho thấy việc đó giúp người khác ra sao (bà không bị vấp, cây xanh tốt, cả nhà ăn cơm sớm hơn) nhưng không nói thẳng.',
        correctDesc: 'Đúng điều tốt mà việc của {NV1} mang lại cho người khác trong lời kể.',
        distractorDesc:
          'Hai điều rõ là sai: một điều chỉ có lợi cho riêng {NV1} (được khen, được thưởng kẹo), và một điều không liên quan đến việc {NV1} làm.',
        hintGuidance: 'Nhắc lại ai đã được giúp sau việc {NV1} làm, không nói ra đáp án.',
        parentPrompts: [
          'Việc bạn nhỏ trong truyện làm đã giúp ai?',
          'Hôm nay con đã làm việc gì giúp cả nhà? Mọi người thấy thế nào?',
        ],
        rationale:
          'Mẫu đo phần "reflecting" của kỹ năng CASEL "Reflecting on one\'s role to promote personal, family, and community well-being": bé nhận ra việc mình làm mang lại điều tốt cho người khác, phân biệt với lợi ích riêng (được khen, được thưởng).',
      }),
    ],
  },
];

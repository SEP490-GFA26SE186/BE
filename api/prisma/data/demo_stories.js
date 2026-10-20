// =============================================================================
// Truyen demo cua be Bin theo khung su pham CASEL (seed_demo.js). Chi la DU LIEU, khong DB.
//
// - Tieu de bat dau bang DEMO_TITLE_PREFIX: seed dung no de khong tao lai khi chay lai.
// - Van ban dung token {NV1} (Bin) / {NV2}; khong ten that.
// - Moi diem dung cham diem tro vao MOT mau cau hoi da ban hanh (sub + dang + tieu de mau);
//   cau hoi lay nguyen khung (questionFrame) cua mau, goi y/phuong an viet tay o day.
// - `answers` la lich su luot choi dau: `daysAgo` so ngay truoc, moi cau co `pick`:
//     emotion_self        -> pick = cam xuc be chon dau tien
//     perspective         -> pick = chi so phuong an (0-based)
//     problem_solving     -> pick = vai ('constructive' | 'avoidant' | 'impulsive')
//   `retry: true` = chon dau sai, nghe goi y roi chon lai dung (attempts = 2).
// Muc tieu: tu nhan thuc "dang phat trien" (4 cau o ky nang con "goi ten cam xuc"), quan he
// "vung" (3 cau o "choi cung nhau"), 3 nang luc con lai chua co du lieu.
// =============================================================================

export const DEMO_TITLE_PREFIX = '[Demo] ';

const BIN = '{NV1}';
const NV2 = '{NV2}';

const TOPIC_ANGER = 'Con hay nổi giận';
const TOPIC_SHARING = 'Tập chia sẻ đồ chơi cùng bạn';

export const DEMO_STORIES = [
  {
    title: `${DEMO_TITLE_PREFIX}Bin và tòa tháp khối gỗ`,
    topicTitle: TOPIC_ANGER,
    length: 'short',
    situation: 'Bé xếp tháp khối gỗ rất cao nhưng tháp đổ, bé giận dữ rồi được bà ôm và xếp lại cùng nhau.',
    second: { aliasName: null }, // NV2 = nhan vat "Ba" cua phu huynh
    scenes: [
      'A bright living room with colorful wooden blocks scattered on the floor',
      'A grandmother opening her arms to hug a small child on a sofa',
    ],
    pages: [
      { scene: 1, text: `Sáng nay, ${BIN} xếp một tòa tháp thật cao bằng những khối gỗ nhiều màu. ${BIN} cười toe toét vì tòa tháp sắp chạm tới mép bàn rồi.` },
      { scene: 1, text: `Bỗng "ầm!" một tiếng, tòa tháp đổ xuống sàn. Các khối gỗ lăn khắp nơi. Mặt ${BIN} nóng bừng, hai tay nắm chặt lại.` },
      { scene: 1, text: `${BIN} dậm chân thình thịch và hét lên: "Con ghét tòa tháp này!" ${NV2} đang ngồi đan len, ngẩng đầu lên nhìn ${BIN}.` },
      { scene: 2, text: `${NV2} không mắng. ${NV2} dang tay ra và nói nhẹ nhàng: "Lại đây với bà nào." ${BIN} chui vào lòng ${NV2}, vai xệ xuống, mắt ngấn nước. Cơn nóng giận tan dần, chỉ còn lại một chút buồn vì tòa tháp đã đổ.` },
      { scene: 2, text: `Một lúc sau, ${BIN} hỏi: "Con xếp lại được không ạ?" ${NV2} gật đầu: "Được chứ. Lần này mình xếp chân tháp thật chắc nhé." Hai bà cháu cùng nhặt từng khối gỗ lên.` },
      { scene: 1, text: `Tòa tháp mới cao dần, cao dần. ${BIN} hít một hơi thật sâu rồi mỉm cười. Hóa ra khi giận, chỉ cần dừng lại và hít thở là lòng nhẹ đi nhiều.` },
    ],
    checkpoints: [
      {
        after: 2, subCode: 'sa_emotion_naming', format: 'emotion_pick', templateTitle: 'Nhân vật chính đang cảm thấy thế nào?',
        answerEmotion: 'angry',
        hint: `Hãy nhớ lại: mặt ${BIN} nóng bừng và hai tay nắm chặt lại.`,
      },
      {
        after: 3, subCode: 'sa_feeling_causes', format: 'single_correct', templateTitle: 'Điều gì làm nhân vật chính có cảm xúc ấy?',
        hint: `Hãy nhớ lại: ${BIN} đã xếp tòa tháp rất cao rồi mới bị đổ.`,
        options: [
          { text: `Vì ${NV2} đang ngồi đan len ở bên cạnh.`, isCorrect: false },
          { text: `Vì ${BIN} đã xếp rất lâu mà tòa tháp lại đổ mất.`, isCorrect: true },
          { text: `Vì hôm nay ${BIN} mặc áo màu xanh.`, isCorrect: false },
        ],
      },
      {
        after: 4, subCode: 'sa_emotion_naming', format: 'emotion_pick', templateTitle: 'Cơ thể báo hiệu cảm xúc gì?',
        answerEmotion: 'sad',
        hint: `Hãy nhớ lại: vai ${BIN} xệ xuống và mắt ngấn nước.`,
      },
    ],
    reflection: { after: 6, question: `${BIN} đã làm gì để cơn giận dịu đi? Còn con, khi giận con sẽ làm gì?` },
    session: {
      daysAgo: 26,
      answers: [
        { pick: 'sad', retry: true },
        { pick: 1 },
        { pick: 'sad' },
      ],
    },
  },
  {
    title: `${DEMO_TITLE_PREFIX}Bin và chiếc xe bị giành mất`,
    topicTitle: TOPIC_ANGER,
    length: 'short',
    situation: 'Bé đang chơi xe đồ chơi thì bị bạn giật mất, bé giận nhưng dừng lại và nói ra điều mình muốn.',
    second: { aliasName: null },
    scenes: [
      'A sunny playground with a sandy track and a small red toy car',
      'Two children standing face to face in a playground, one holding a toy car',
    ],
    pages: [
      { scene: 1, text: `Ở sân chơi, ${BIN} đang chạy chiếc xe đồ chơi màu đỏ trên con đường cát. Đó là món đồ chơi ${BIN} thích nhất.` },
      { scene: 1, text: `Một bạn chạy tới, giật lấy chiếc xe rồi chạy đi mất. ${BIN} đứng sững lại, môi mím chặt, mắt đỏ hoe.` },
      { scene: 1, text: `${BIN} nghĩ: "Mình chưa chơi xong mà. Bạn ấy không hỏi mình trước." Rồi ${BIN} cúi mặt, chẳng biết nói gì.` },
      { scene: 2, text: `${BIN} nắm chặt tay, má phồng lên và bước thật nhanh về phía bạn ấy. Tim ${BIN} đập thình thịch.` },
      { scene: 2, text: `Nhưng ${BIN} dừng lại, hít một hơi sâu rồi nói to: "Tớ chưa chơi xong. Cậu đợi tớ một chút nhé!" Bạn ấy ngạc nhiên rồi trả xe lại cho ${BIN}.` },
      { scene: 1, text: `Sau đó, hai bạn cùng chơi: một bạn lái xe, một bạn đẩy xe, rồi đổi phiên cho nhau. ${BIN} cười thật tươi.` },
    ],
    checkpoints: [
      {
        after: 2, subCode: 'sa_emotion_naming', format: 'emotion_pick', templateTitle: 'Nhân vật chính đang cảm thấy thế nào?',
        answerEmotion: 'sad',
        hint: `Hãy nhớ lại: môi ${BIN} mím chặt và mắt đỏ hoe.`,
      },
      {
        after: 3, subCode: 'sa_feeling_causes', format: 'single_correct', templateTitle: 'Điều gì làm nhân vật chính có cảm xúc ấy?',
        hint: `Hãy nhớ lại điều ${BIN} đã nghĩ: bạn ấy không hỏi trước khi lấy xe.`,
        options: [
          { text: `Vì sân chơi hôm nay có nhiều cát.`, isCorrect: false },
          { text: `Vì chiếc xe có màu đỏ.`, isCorrect: false },
          { text: `Vì ${BIN} nghĩ bạn ấy lấy xe khi chưa hỏi mình.`, isCorrect: true },
        ],
      },
      {
        after: 4, subCode: 'sa_emotion_naming', format: 'emotion_pick', templateTitle: 'Cơ thể báo hiệu cảm xúc gì?',
        answerEmotion: 'angry',
        hint: `Hãy nhớ lại: ${BIN} nắm chặt tay, má phồng lên và tim đập thình thịch.`,
      },
    ],
    reflection: { after: 6, question: `${BIN} đã nói gì với bạn khi bị giành mất xe? Nếu là con, con sẽ nói gì?` },
    session: {
      daysAgo: 13,
      answers: [
        { pick: 'sad' },
        { pick: 0, retry: true },
        { pick: 'angry' },
      ],
    },
  },
  {
    title: `${DEMO_TITLE_PREFIX}Bin và hộp bút chì màu`,
    topicTitle: TOPIC_SHARING,
    length: 'long',
    situation: 'Cả bàn cùng muốn một cây bút màu trong giờ vẽ; bé học cách thay phiên và cùng vẽ chung một bức tranh.',
    second: { aliasName: 'Mi' }, // NV2 = ban cung ban, ten gia
    scenes: [
      'A classroom table with a big box of colored pencils and sheets of paper',
      'Two children reaching for the same yellow pencil at a classroom table',
      'A large drawing of the sea, a forest and a bright sun pinned on a classroom wall',
    ],
    pages: [
      { scene: 1, text: `Hôm nay lớp có giờ vẽ. Cô giáo đặt lên bàn một hộp bút chì màu thật to. ${BIN} và ${NV2} ngồi cạnh nhau, mắt sáng long lanh.` },
      { scene: 2, text: `Cả hai cùng muốn cây bút màu vàng để vẽ mặt trời. ${BIN} và ${NV2} cùng đưa tay ra, chạm vào cây bút cùng một lúc.` },
      { scene: 1, text: `${BIN} nhìn hộp bút còn rất nhiều màu khác. Cô giáo đi quanh lớp và mỉm cười với các bạn.` },
      { scene: 2, text: `${NV2} nói: "Tớ muốn vẽ biển xanh." ${BIN} lắc đầu: "Tớ muốn vẽ rừng cây cơ." Hai bạn chưa ai chịu nhường ai.` },
      { scene: 1, text: `Cô giáo trải ra một tờ giấy thật to và nói: "Cả bàn mình cùng vẽ chung một bức tranh nhé!"` },
      { scene: 1, text: `Cả bàn có bốn bạn nhưng chỉ có một tờ giấy và một hộp bút. Ai cũng muốn được vẽ ngay.` },
      { scene: 1, text: `Cả bàn cùng bàn bạc. Bạn thì vẽ biển, bạn thì vẽ rừng cây, còn ${BIN} vẽ những đám mây trắng xốp.` },
      { scene: 2, text: `Đến lúc tô màu, ${BIN} và một bạn khác lại cùng muốn cây bút đỏ để tô mái nhà bé xíu bên bờ biển.` },
      { scene: 3, text: `Bức tranh hoàn thành, có biển xanh, rừng cây và mặt trời vàng rực. Cô giáo dán bức tranh lên tường lớp.` },
      { scene: 3, text: `${BIN} đứng ngắm bức tranh chung của cả bàn và thấy lòng thật vui. Một mình vẽ cũng thích, nhưng cùng nhau vẽ còn thích hơn nhiều.` },
    ],
    checkpoints: [
      {
        after: 2, subCode: 'rs_playing_together', format: 'role_choice', templateTitle: 'Cả nhóm cùng muốn một món',
        hint: null,
        options: [
          { role: 'constructive', text: `Nói: "Mỗi bạn vẽ một lúc nhé, tớ vẽ trước rồi đến lượt cậu."`, feedback: 'Cách này hay quá! Thay phiên giúp cả hai bạn đều được vẽ mặt trời.' },
          { role: 'avoidant', text: `Rụt tay lại, vẽ bằng màu khác dù mình rất thích màu vàng.`, feedback: 'Có thể bạn đã nhường, nhưng bạn cũng buồn đấy. Mình có thể nói ra điều mình muốn nữa.' },
          { role: 'impulsive', text: `Giật cây bút về phía mình để vẽ trước.`, feedback: 'Giật đồ có thể làm bạn buồn. Lần sau mình thử nói với bạn trước nhé.' },
        ],
      },
      {
        after: 4, subCode: 'rs_making_up', format: 'role_choice', templateTitle: 'Bất đồng với một bạn',
        hint: null,
        options: [
          { role: 'constructive', text: `Nói: "Tớ hơi buồn vì tớ muốn vẽ rừng cây." Nghe bạn nói, rồi đề nghị: "Mình vẽ cả biển lẫn rừng nhé?"`, feedback: 'Tuyệt vời! Nói cảm xúc, nghe bạn và cùng tìm cách là cách rất giỏi.' },
          { role: 'avoidant', text: `Im lặng, quay đi và tự vẽ một mình.`, feedback: 'Im lặng thì bạn không biết con nghĩ gì. Mình thử nói với bạn nhé.' },
          { role: 'impulsive', text: `Nói to: "Tớ không chơi với cậu nữa!"`, feedback: 'Nói to lúc giận dễ làm bạn buồn. Mình hít thở rồi nói nhẹ nhàng hơn nhé.' },
        ],
      },
      {
        after: 6, subCode: 'rs_playing_together', format: 'single_correct', templateTitle: 'Cách nào để cả nhóm cùng chơi vui?',
        hint: `Hãy nhớ lại: có bốn bạn nhưng chỉ có một tờ giấy và một hộp bút.`,
        options: [
          { text: `Chỉ một bạn vẽ, các bạn còn lại ngồi nhìn.`, isCorrect: false },
          { text: `Mỗi bạn vẽ một phần rồi đổi phiên cho nhau.`, isCorrect: true },
          { text: `Mọi người đứng chờ, không ai vẽ gì cả.`, isCorrect: false },
        ],
      },
      {
        after: 8, subCode: 'rs_playing_together', format: 'role_choice', templateTitle: 'Cả nhóm cùng muốn một món',
        hint: null,
        options: [
          { role: 'constructive', text: `Đề nghị: "Cậu tô một nửa mái nhà, tớ tô nửa còn lại nhé."`, feedback: 'Chia ra cùng làm, hay lắm! Mái nhà sẽ đẹp hơn nhiều.' },
          { role: 'avoidant', text: `Đi ra góc bàn và tự vẽ một bức tranh nhỏ cho xong chuyện.`, feedback: 'Bỏ đi thì nhẹ lòng một chút, nhưng mình sẽ lỡ cơ hội vẽ chung. Thử rủ bạn cùng làm nhé.' },
          { role: 'impulsive', text: `Giành lấy cây bút đỏ để tô theo ý mình.`, feedback: 'Giành đồ làm bạn khó chịu. Lần sau mình thử hỏi bạn trước nhé.' },
        ],
      },
    ],
    reflection: { after: 10, question: `Khi cùng muốn một thứ như ${BIN}, con và bạn đã làm gì để cả hai cùng vui?` },
    session: {
      daysAgo: 4,
      answers: [
        { pick: 'constructive' },
        { pick: 'avoidant' },
        { pick: 1 },
        { pick: 'avoidant' },
      ],
    },
  },
];

/** Truyen tu viet: do phu huynh tu soan, khong bai hoc, khong cau hoi, khong tinh diem. */
export const DEMO_CUSTOM_STORY = {
  title: `${DEMO_TITLE_PREFIX}Bin và chú mèo lạc đường`,
  length: 'custom',
  situation: null,
  scenes: [
    'A small gray kitten standing alone on a quiet street at dusk',
    'A cozy kitchen with a bowl of milk on the floor and a boy kneeling beside a kitten',
  ],
  pages: [
    { scene: 1, text: `Chiều nay, trên đường về nhà, ${BIN} nhìn thấy một chú mèo xám nhỏ xíu đang đứng run run bên vệ đường.` },
    { scene: 1, text: `"Meo... meo..." Chú mèo kêu lên khe khẽ. ${BIN} ngồi xuống, nhẹ nhàng nói: "Đừng sợ nhé, mình không làm đau bạn đâu."` },
    { scene: 2, text: `${BIN} bế chú mèo về nhà và nói với mẹ. Mẹ rót cho chú mèo một bát sữa ấm. Chú mèo uống một hơi hết sạch.` },
    { scene: 2, text: `Hôm sau, hai mẹ con dán giấy tìm chủ cho chú mèo. Chiều đó, một bác hàng xóm chạy sang, mắt rưng rưng vì mừng.` },
    { scene: 2, text: `Chú mèo về nhà mình rồi. ${BIN} vẫy tay chào và thầm nghĩ: "Giúp được bạn mèo, mình vui lắm."` },
  ],
};

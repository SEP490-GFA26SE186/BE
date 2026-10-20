// =============================================================================
// 40 muc cua khung CASEL — nguyen van tieng Anh, theo dung thu tu tren trang CASEL
// (https://casel.org/fundamentals-of-sel/what-is-the-casel-framework/).
// Bang casel_references chi doc: khong co API ghi, chi doi qua file nay (seed) hoac migration.
// skill = casel_code cua eq_skills. code on dinh, la khoa idempotent cua seed.
// =============================================================================

export const CASEL_URL = 'https://casel.org/fundamentals-of-sel/what-is-the-casel-framework/';

const raw = {
  self_awareness: [
    ['sa_integrating_identities', 'Integrating personal and social identities'],
    ['sa_identifying_assets', 'Identifying personal, cultural, and linguistic assets'],
    ['sa_identifying_emotions', "Identifying one's emotions"],
    ['sa_honesty_integrity', 'Demonstrating honesty and integrity'],
    ['sa_linking_feelings_values_thoughts', 'Linking feelings, values, and thoughts'],
    ['sa_examining_prejudices', 'Examining prejudices and biases'],
    ['sa_self_efficacy', 'Experiencing self-efficacy'],
    ['sa_growth_mindset', 'Having a growth mindset'],
    ['sa_interests_purpose', 'Developing interests and a sense of purpose'],
  ],
  self_management: [
    ['sm_managing_emotions', "Managing one's emotions"],
    ['sm_stress_strategies', 'Identifying and using stress management strategies'],
    ['sm_self_discipline_motivation', 'Exhibiting self-discipline and self-motivation'],
    ['sm_setting_goals', 'Setting personal and collective goals'],
    ['sm_planning_organizing', 'Using planning and organizational skills'],
    ['sm_courage_initiative', 'Showing the courage to take initiative'],
    ['sm_agency', 'Demonstrating personal and collective agency'],
  ],
  social_awareness: [
    ['soa_perspective_taking', "Taking others' perspectives"],
    ['soa_strengths_in_others', 'Recognizing strengths in others'],
    ['soa_empathy_compassion', 'Demonstrating empathy and compassion'],
    ['soa_concern_for_feelings', 'Showing concern for the feelings of others'],
    ['soa_gratitude', 'Understanding and expressing gratitude'],
    ['soa_social_norms', 'Identifying diverse social norms, including unjust ones'],
    ['soa_situational_demands', 'Recognizing situational demands and opportunities'],
    ['soa_organizations_systems', 'Understanding the influences of organizations and systems on behavior'],
  ],
  relationship_skills: [
    ['rs_communicating', 'Communicating effectively'],
    ['rs_positive_relationships', 'Developing positive relationships'],
    ['rs_cultural_competency', 'Demonstrating cultural competency'],
    ['rs_teamwork', 'Practicing teamwork and collaborative problem-solving'],
    ['rs_resolving_conflicts', 'Resolving conflicts constructively'],
    ['rs_resisting_pressure', 'Resisting negative social pressure'],
    ['rs_leadership', 'Showing leadership in groups'],
    ['rs_support_help', 'Seeking or offering support and help when needed'],
    ['rs_standing_up', 'Standing up for the rights of others'],
  ],
  responsible_decision_making: [
    ['rdm_curiosity_open_mind', 'Demonstrating curiosity and open-mindedness'],
    ['rdm_reasoned_judgment', 'Learning how to make a reasoned judgment after analyzing information, data, and facts'],
    ['rdm_identifying_solutions', 'Identifying solutions for personal and social problems'],
    ['rdm_anticipating_consequences', "Anticipating and evaluating the consequences of one's actions"],
    ['rdm_critical_thinking', 'Recognizing how critical thinking skills are useful both inside and outside of school'],
    ['rdm_reflecting_role', "Reflecting on one's role to promote personal, family, and community well-being"],
    ['rdm_evaluating_impacts', 'Evaluating personal, interpersonal, community, and institutional impacts'],
  ],
};

// { code, skill, textEn, order } — order bat dau tu 1 trong tung nang luc
export const CASEL_REFERENCES = Object.entries(raw).flatMap(([skill, items]) =>
  items.map(([code, textEn], i) => ({ code, skill, textEn, order: i + 1 })),
);

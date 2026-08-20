/**
 * PROMPT EDU ERP — Default classroom-observation rubric (§Teacher-Profile
 * feature), transcribed from the user-supplied "Teachers Observation" PDF:
 * 5 domains, 20 criteria, each scored 1-5 with its own descriptor +
 * explanatory text per level (the PDF's per-criterion 5x5 table, pages 2-6).
 *
 * This is INSTITUTION CONFIGURATION, not platform logic (§K) — see
 * modules/staff/service.ts's listObservationCriteria() doc comment for how
 * this default is lazily seeded per institution (once, on first read) and
 * freely editable afterward, never re-applied over an institution's own
 * edits.
 */
export interface ObservationLevel {
  score: number;
  descriptor: string;
  explanation: string;
}
export interface DefaultObservationCriterion {
  domain: string;
  criteriaText: string;
  sortOrder: number;
  levels: ObservationLevel[];
}

const D = (
  domain: string, criteriaText: string, sortOrder: number,
  l5: string, l4: string, l3: string, l2: string, l1: string
): DefaultObservationCriterion => ({
  domain, criteriaText, sortOrder,
  levels: [
    { score: 5, descriptor: "Outstanding / Exemplary", explanation: l5 },
    { score: 4, descriptor: "Very Good / Above Expectations", explanation: l4 },
    { score: 3, descriptor: "Good / Meets Expectations", explanation: l3 },
    { score: 2, descriptor: "Needs Improvement", explanation: l2 },
    { score: 1, descriptor: "Unsatisfactory / Immediate Improvement Required", explanation: l1 },
  ],
});

export const DEFAULT_OBSERVATION_CRITERIA: DefaultObservationCriterion[] = [
  D("A. Planning & Preparation", "1. Lesson planning and preparedness", 1,
    "Thorough, well-structured plan; all resources ready; lesson flows smoothly.",
    "Well-planned with minor gaps; resources mostly ready.",
    "Adequately planned; basic preparation completed.",
    "Limited planning; some important preparation missing.",
    "No clear planning; lesson is poorly prepared."),
  D("A. Planning & Preparation", "2. Clear learning objectives", 2,
    "Objectives are specific, measurable and clearly communicated; fully aligned with the lesson.",
    "Objectives are clear and mostly measurable and aligned.",
    "Objectives are stated but may lack clarity or measurability.",
    "Objectives are vague or only partly communicated.",
    "No clear learning objectives."),
  D("A. Planning & Preparation", "3. Appropriate teaching-learning materials", 3,
    "Selects highly appropriate, engaging and varied materials that significantly support learning.",
    "Uses appropriate materials effectively.",
    "Uses basic materials relevant to the lesson.",
    "Limited or partially relevant materials are used.",
    "Materials are absent, inappropriate or ineffective."),
  D("A. Planning & Preparation", "4. Subject knowledge and accuracy", 4,
    "Demonstrates excellent, accurate and comprehensive subject knowledge; explains concepts confidently and correctly.",
    "Demonstrates strong and accurate subject knowledge with minor gaps.",
    "Demonstrates adequate subject knowledge; occasional minor errors.",
    "Shows limited knowledge; several inaccuracies or difficulties in explanation.",
    "Demonstrates inadequate knowledge; frequent or serious inaccuracies."),

  D("B. Classroom Teaching", "5. Clarity of explanation", 5,
    "Explains concepts exceptionally clearly, logically and systematically; uses suitable examples and checks understanding.",
    "Explains clearly and logically with relevant examples; minor gaps.",
    "Explanation is generally clear and understandable.",
    "Explanation is sometimes unclear, fragmented or difficult to follow.",
    "Explanation is unclear, confusing or inaccurate."),
  D("B. Classroom Teaching", "6. Appropriate teaching strategies", 6,
    "Uses varied, highly appropriate student-centred strategies effectively according to learning needs.",
    "Uses appropriate strategies effectively with good adaptation.",
    "Uses suitable teaching strategies that adequately support learning.",
    "Uses limited or inconsistently appropriate strategies.",
    "Uses inappropriate or ineffective strategies with little adaptation."),
  D("B. Classroom Teaching", "7. Effective questioning techniques", 7,
    "Uses purposeful, varied and higher-order questions; effectively encourages thinking and checks understanding.",
    "Uses varied and relevant questions; regularly promotes student thinking.",
    "Uses appropriate questions mainly to check understanding and recall.",
    "Questions are mostly basic or limited; little probing or follow-up.",
    "Rarely questions students or uses ineffective questions."),
  D("B. Classroom Teaching", "8. Student engagement and participation", 8,
    "Almost all students are actively engaged, participate meaningfully and remain attentive throughout.",
    "Most students are actively engaged and participate regularly.",
    "Adequate student participation; engagement is generally maintained.",
    "Participation is limited; several students remain passive or disengaged.",
    "Students show very little engagement or participation."),

  D("C. Classroom Management", "9. Classroom discipline and management", 9,
    "Maintains excellent discipline through clear expectations, proactive management and effective handling of disruptions.",
    "Maintains good discipline with minimal disruptions and effective management.",
    "Maintains acceptable discipline; occasional disruptions are managed adequately.",
    "Discipline is inconsistent; frequent disruptions affect learning.",
    "Poor classroom control; disruptions significantly affect learning."),
  D("C. Classroom Management", "10. Time management", 10,
    "Uses time exceptionally well; all planned activities are completed within the allotted time with smooth transitions.",
    "Manages time effectively; most planned activities are completed on time.",
    "Generally manages time adequately; minor delays occur.",
    "Time is poorly managed; important activities are rushed or omitted.",
    "Ineffective time management; lesson objectives are not achieved within the allotted time."),
  D("C. Classroom Management", "11. Positive classroom environment", 11,
    "Creates a highly respectful, supportive, safe and motivating learning environment where students feel valued.",
    "Maintains a positive, respectful and supportive classroom environment.",
    "Creates a generally positive and respectful environment.",
    "Classroom atmosphere is inconsistent; limited evidence of encouragement and support.",
    "Creates an unwelcoming, negative or discouraging classroom environment."),
  D("C. Classroom Management", "12. Inclusiveness and attention to individual learners", 12,
    "Consistently accommodates diverse needs and provides effective individual support to ensure every learner participates and progresses.",
    "Recognises individual differences and provides appropriate support to most learners.",
    "Provides adequate attention to individual differences and learning needs.",
    "Gives limited individual attention; some learners' needs are overlooked.",
    "Makes little or no effort to address individual differences or learning needs."),

  D("D. Assessment & Feedback", "13. Checks for understanding (Evaluation in the TLM)", 13,
    "Consistently checks understanding using varied methods; identifies misconceptions and adjusts teaching immediately.",
    "Frequently checks understanding and addresses most learning gaps.",
    "Checks understanding at appropriate points; addresses basic gaps.",
    "Checks understanding occasionally; some misconceptions remain unaddressed.",
    "Rarely checks understanding; learning gaps are not identified or addressed."),
  D("D. Assessment & Feedback", "14. Assessment techniques (FA & SA)", 14,
    "Uses appropriate Formative and Summative Assessment techniques systematically and effectively to measure learning outcomes.",
    "Uses a good range of appropriate FA and SA techniques with minor gaps.",
    "Uses basic FA and SA techniques adequately.",
    "Uses limited or inconsistently appropriate assessment techniques.",
    "Assessment techniques are absent, inappropriate or ineffective."),
  D("D. Assessment & Feedback", "15. Feedback and correction (Diary & Notebook)", 15,
    "Provides timely, specific and constructive feedback; corrections are thorough and consistently followed up in diaries and notebooks.",
    "Provides regular and useful feedback; corrections are generally complete and followed up.",
    "Provides adequate feedback and correction with occasional gaps.",
    "Feedback or correction is irregular, incomplete or lacks specificity.",
    "Feedback and correction are rarely provided or are ineffective."),
  D("D. Assessment & Feedback", "16. Remedial/enrichment support", 16,
    "Systematically identifies learning needs and provides well-planned remedial or enrichment activities with clear evidence of progress.",
    "Provides appropriate remedial/enrichment support to most learners based on identified needs.",
    "Provides basic remedial/enrichment support when required.",
    "Support is limited, irregular or not sufficiently targeted.",
    "No meaningful remedial or enrichment support is provided."),

  D("E. Professional Practice", "17. Communication skills", 17,
    "Communicates exceptionally clearly, confidently and professionally; uses appropriate language, tone and body language.",
    "Communicates clearly and professionally with minor gaps.",
    "Communication is generally clear and appropriate.",
    "Communication is sometimes unclear, inconsistent or ineffective.",
    "Communication is unclear, inappropriate or significantly affects learning."),
  D("E. Professional Practice", "18. Use of technology/innovative practices", 18,
    "Integrates technology and innovative, learner-centred practices creatively and effectively to significantly enhance learning.",
    "Uses technology and innovative practices effectively to support learning.",
    "Uses appropriate technology or innovative methods when required.",
    "Limited or inconsistent use of technology/innovative practices.",
    "Rarely or never uses technology or innovative practices appropriately."),
  D("E. Professional Practice", "19. Professional attitude and teacher presence", 19,
    "Demonstrates exemplary professionalism, punctuality, responsibility, confidence, positive presence and role-model behaviour.",
    "Consistently demonstrates professional attitude and strong teacher presence.",
    "Demonstrates satisfactory professionalism and appropriate teacher presence.",
    "Professionalism or teacher presence is inconsistent and needs improvement.",
    "Demonstrates poor professionalism, attitude or teacher presence."),
  D("E. Professional Practice", "20. Achievement of lesson objectives - SDE", 20,
    "All/most lesson objectives are fully achieved; clear evidence of student learning and effective use of SDE evaluation.",
    "Most objectives are achieved with good evidence of learning and SDE outcomes.",
    "Expected objectives are adequately achieved; basic evidence of learning is available.",
    "Some objectives are achieved; significant learning gaps remain.",
    "Objectives are largely not achieved; little or no evidence of learning/SDE achievement."),
];

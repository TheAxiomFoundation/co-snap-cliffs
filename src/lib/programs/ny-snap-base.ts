// Auto-generated from engine/artifacts/ny-snap.compiled.json.
// Run: bash scripts/build-artifacts.sh && python3 scripts/generate-program-base.py \
//   --slug ny-snap --schema ny-snap.fy-2026 \
//   --artifact engine/artifacts/ny-snap.compiled.json \
//   --donor engine/artifacts/co-snap-base.json \
//   --engine engine/axiom-rules-engine/target/release/axiom-rules-engine \
//   --input-prefix 'us-ny:policies/otda/snap/fy-2026-benefit-calculation#input.' \
//   --out engine/artifacts/ny-snap-base.json
// (then re-emit this module via scripts/dump-program-bases.ts round-trip check).
// Schema is derived from the compiled axiom-rules-engine program — every input the
// engine reaches is listed here with an engine-verified dtype and default. The
// person_inputs list additionally covers slots the engine demands under
// UI-reachable fact values (e.g. member_age 18-59 opens the work-requirement
// path), which the default-value convergence pass alone does not reach.
// DO NOT EDIT BY HAND.

export const NY_SNAP_BASE = {
  "schema": "ny-snap.fy-2026",
  "input_prefix": "us-ny:policies/otda/snap/fy-2026-benefit-calculation#input.",
  "household_inputs": [
    {
      "name": "adequate_child_care_unavailable_to_attend_class_and_meet_student_work_requirement",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "alaska_subsistence_hunts_or_fishes_30_hours_weekly",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "alien_status_documentation_missing_or_unwilling",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "all_household_members_experiencing_homelessness",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "assigned_or_placed_in_higher_education_through_qualifying_employment_training_program",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "child_support_deduction",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "dependent_care_deduction",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "enrolled_at_least_half_time",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "enrolled_in_business_technical_trade_or_vocational_school_requiring_high_school_diploma",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "enrolled_in_college_or_university_degree_program",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "enrolled_through_jobs_or_successor_program",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "federal_minimum_wage",
      "dtype": "decimal",
      "default": 0
    },
    {
      "name": "federal_or_state_minimum_wage",
      "dtype": "decimal",
      "default": 0
    },
    {
      "name": "first_full_month_benefit_level",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "homeless_household_free_shelter_all_month",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "homeless_household_has_shelter_costs",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "household_applies_following_more_than_30_days_not_certified",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "household_billed_separately_for_non_telephone_standard_utility",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "household_certified_for_participation_in_food_stamp_program",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "household_contains_individual_participating_in_more_than_one_household_or_project_area",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "household_entitled_to_excess_medical_deduction",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "household_entitled_to_heap_or_liheaa_payment",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "household_has_earned_income_budgeted_for_snap",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "household_has_out_of_pocket_dependent_care_expenses",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "household_in_central_meter_housing_charged_only_for_excess_heating_or_cooling",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "household_in_project_area_solely_for_vacation",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "household_incurred_or_anticipated_basic_service_cost_for_one_telephone",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "household_incurred_or_anticipated_heating_or_cooling_costs_separate_from_rent_or_mortgage",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "household_initial_month",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "household_is_migrant_or_seasonal_farmworker_household",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "household_lives_in_application_state",
      "dtype": "bool",
      "default": true
    },
    {
      "name": "household_member_disqualified_for_failure_to_comply_with_periodic_reporting_requirements",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "household_member_disqualified_for_failure_to_comply_with_work_requirements",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "household_member_disqualified_for_intentional_program_violation",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "household_member_ineligible_to_participate_in_snap",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "household_resides_in_nassau_or_suffolk_county",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "household_resides_in_new_york_city",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "household_shelter_costs_incurred",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "household_size",
      "dtype": "integer",
      "default": 1
    },
    {
      "name": "household_was_not_certified_for_participation_during_prior_period",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "known_student_refused_work_study_assignment",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "medical_deduction",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "member_abawd_monthly_work_hours",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "member_abawd_weekly_work_hours",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "member_accepted_bona_fide_suitable_employment_offer_if_offered",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_age",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "member_age_16_or_17_is_not_household_head_or_attends_school_or_training_half_time",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_age_24_or_younger_and_was_in_foster_care_on_attaining_age_18",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_authorized_to_receive_family_assistance_nonemergency_safety_net_or_ssi_benefits_but_not_yet_paid",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_combines_work_and_work_program_20_hours_weekly",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_covered_by_abawd_time_limit_waiver",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_determined_eligible_for_family_assistance_or_nonemergency_safety_net_benefits",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_family_assistance_nonemergency_safety_net_or_ssi_benefits_suspended_or_being_recouped",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_family_assistance_or_nonemergency_safety_net_grant_amount",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "member_has_additional_three_month_abawd_eligibility",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_has_deportation_or_removal_withheld",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_has_documentary_or_collateral_evidence_of_ssn_application_or_every_effort",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_has_eligible_military_connection",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_is_amerasian_immigrant",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_is_american_indian_born_in_canada_or_recognized_indian_tribe_member",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_is_asylee",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_is_cuban_or_haitian_entrant",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_is_hmong_or_highland_laotian_qualifying_person_or_family_member",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_is_homeless",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_is_parent_of_household_member_under_age_eighteen",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_is_pregnant",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_is_qualified_alien_subject_to_five_year_wait",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_is_qualified_alien_with_forty_qualifying_quarters",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_is_refugee",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_is_trafficking_victim_or_qualifying_family_member",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_is_under_age_eighteen",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_is_us_citizen",
      "dtype": "bool",
      "default": true
    },
    {
      "name": "member_is_us_noncitizen_national",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_is_veteran",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_later_provided_ssn_ending_disqualification",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_medically_certified_physically_or_mentally_unfit_for_employment",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_paid_family_assistance_or_nonemergency_safety_net_benefits",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_participated_in_snap_et_if_assigned",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_participated_in_workfare_if_assigned",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_participates_in_abawd_work_program_20_hours_weekly",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_participates_in_abawd_workfare_program",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_physically_or_mentally_unfit_for_employment",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_provided_employment_status_or_availability_information",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_receives_blindness_or_disability_benefits",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_receives_family_assistance_nonemergency_safety_net_or_ssi_benefits",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_receiving_or_applying_for_unemployment_compensation_and_complying",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_refused_or_failed_to_provide_or_apply_for_ssn",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_regained_abawd_eligibility",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_registered_for_work_or_registered_by_state",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_regular_participant_in_drug_or_alcohol_treatment",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_reported_to_referred_suitable_employer_if_referred",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_resides_with_household_member_under_age_eighteen",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_responsible_for_dependent_child_under_six_or_incapacitated_person",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_snap_work_requirements_waived_due_to_pending_ssi_joint_application",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_ssn_application_filed_pending_state_agency_notification",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_student_enrolled_at_least_half_time_and_student_eligible",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_subject_to_and_complying_with_title_iv_work_requirement",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_unable_to_obtain_documents_required_for_ssn_application_with_caseworker_assistance_needed",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_voluntarily_quit_or_reduced_work_below_30_hours_without_good_cause",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_was_lawfully_residing_on_1996_08_22_and_born_on_or_before_1931_08_22",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_weekly_wages",
      "dtype": "decimal",
      "default": 0
    },
    {
      "name": "member_weekly_work_hours",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "migrant_or_seasonal_farmworker_under_contract_to_begin_employment_within_30_days",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "proration_factor_from_application_day_to_end_of_initial_month",
      "dtype": "decimal",
      "default": 1.0
    },
    {
      "name": "proration_factor_from_release_day_to_end_of_month",
      "dtype": "decimal",
      "default": 1.0
    },
    {
      "name": "public_institution_prerelease_joint_ssi_food_stamp_applicant",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "qualified_alien_five_year_status_period_met",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "resident_of_battered_women_and_children_shelter_and_prior_abusive_household_member",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "responsible_for_care_of_dependent_child_under_twelve",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "responsible_for_care_of_dependent_household_member_age_six_to_under_twelve",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "responsible_for_care_of_dependent_household_member_under_age_six",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "single_parent_enrolled_full_time_in_higher_education",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "single_parent_household_condition_satisfied",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "snap_abawd_countable_months_in_three_year_period",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "snap_allowable_monthly_child_support_payments",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "snap_allowable_monthly_dependent_care_expenses",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "snap_claimed_homeless_shelter_deduction",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "snap_countable_earned_income",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "snap_countable_financial_resources",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "snap_countable_unearned_income",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "snap_gross_monthly_earned_income",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "snap_income_exclusions",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "snap_initial_month_prorated_allotment",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "snap_maximum_allotment_for_one_person_household",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "snap_total_allowable_shelter_expenses",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "snap_total_medical_expenses",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "snap_total_monthly_unearned_income",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "state_agency_averaged_student_work_hours_meet_twenty_per_week",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "state_agency_fault_in_ssn_application_processing",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "state_agency_rounds_thirty_percent_net_income_up",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "student_age",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "student_anticipates_working_in_work_study",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "student_currently_being_trained_by_employer",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "student_enrollment_status_ending_event_occurred",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "student_paid_employment_hours_per_week",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "student_participating_in_on_the_job_training_program",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "student_participating_in_state_or_federally_financed_work_study",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "student_physically_or_mentally_unfit",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "student_receives_tanf",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "student_school_term_has_begun",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "student_self_employment_hours_per_week",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "student_self_employment_weekly_earnings",
      "dtype": "decimal",
      "default": 0
    },
    {
      "name": "verified_higher_homeless_shelter_costs",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "work_study_approved_at_snap_application",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "work_study_approved_for_school_term",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "work_study_exemption_period_active",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "work_supplementation_earned_income",
      "dtype": "integer",
      "default": 0
    }
  ],
  "person_inputs": [
    {
      "name": "enrolled_at_least_half_time",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "federal_or_state_minimum_wage",
      "dtype": "decimal",
      "default": 0
    },
    {
      "name": "member_age",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "member_age_16_or_17_is_not_household_head_or_attends_school_or_training_half_time",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_authorized_to_receive_family_assistance_nonemergency_safety_net_or_ssi_benefits_but_not_yet_paid",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_determined_eligible_for_family_assistance_or_nonemergency_safety_net_benefits",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_family_assistance_nonemergency_safety_net_or_ssi_benefits_suspended_or_being_recouped",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_is_parent_of_household_member_under_age_eighteen",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_is_us_citizen",
      "dtype": "bool",
      "default": true
    },
    {
      "name": "member_medically_certified_physically_or_mentally_unfit_for_employment",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_physically_or_mentally_unfit_for_employment",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_receives_family_assistance_nonemergency_safety_net_or_ssi_benefits",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_receiving_or_applying_for_unemployment_compensation_and_complying",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_refused_or_failed_to_provide_or_apply_for_ssn",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_regular_participant_in_drug_or_alcohol_treatment",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_resides_with_household_member_under_age_eighteen",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_responsible_for_dependent_child_under_six_or_incapacitated_person",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_subject_to_and_complying_with_title_iv_work_requirement",
      "dtype": "bool",
      "default": false
    },
    {
      "name": "member_weekly_wages",
      "dtype": "decimal",
      "default": 0
    },
    {
      "name": "member_weekly_work_hours",
      "dtype": "integer",
      "default": 0
    },
    {
      "name": "snap_member_is_elderly_or_disabled",
      "dtype": "bool",
      "default": false
    }
  ],
  "relations": [
    "us:statutes/7/2012/j#relation.member_of_household",
    "us-ny:regulations/18-nycrr/387/14/a/5#relation.ny_snap_categorical_member_of_household",
    "us-ny:policies/otda/snap/fy-2026-benefit-calculation#relation.member_of_household"
  ],
  "outputs_by_name": {
    "snap_maximum_allotment": "us:policies/usda/snap/fy-2026-cola/maximum-allotments#snap_maximum_allotment",
    "snap_one_person_thrifty_food_plan_cost": "us:policies/usda/snap/fy-2026-cola/maximum-allotments#snap_one_person_thrifty_food_plan_cost",
    "snap_household_has_elderly_or_disabled_member": "us:statutes/7/2012/j#snap_household_has_elderly_or_disabled_member",
    "snap_standard_deduction_48_states_dc": "us:policies/usda/snap/fy-2026-cola/deductions#snap_standard_deduction_48_states_dc",
    "snap_standard_deduction": "us:policies/usda/snap/fy-2026-cola/deductions#snap_standard_deduction",
    "snap_asset_limit": "us:policies/usda/snap/fy-2026-cola/deductions#snap_asset_limit",
    "snap_net_income_limit_100_percent_fpl_48_states_dc": "us:policies/usda/snap/fy-2026-cola/income-eligibility-standards#snap_net_income_limit_100_percent_fpl_48_states_dc",
    "snap_gross_income_limit_130_percent_fpl_48_states_dc": "us:policies/usda/snap/fy-2026-cola/income-eligibility-standards#snap_gross_income_limit_130_percent_fpl_48_states_dc",
    "snap_gross_income_limit_165_percent_fpl_48_states_dc": "us:policies/usda/snap/fy-2026-cola/income-eligibility-standards#snap_gross_income_limit_165_percent_fpl_48_states_dc",
    "snap_duplicate_participation_exception_applies": "us:regulations/7-cfr/273/3#snap_duplicate_participation_exception_applies",
    "snap_household_duplicate_participation_barred": "us:regulations/7-cfr/273/3#snap_household_duplicate_participation_barred",
    "snap_household_state_resident": "us:regulations/7-cfr/273/3#snap_household_state_resident",
    "snap_household_residency_eligible": "us:regulations/7-cfr/273/3#snap_household_residency_eligible",
    "snap_member_citizen_or_national_status_eligible": "us:regulations/7-cfr/273/4#snap_member_citizen_or_national_status_eligible",
    "snap_member_special_nonqualified_alien_status_eligible": "us:regulations/7-cfr/273/4#snap_member_special_nonqualified_alien_status_eligible",
    "snap_member_qualified_alien_immediately_eligible": "us:regulations/7-cfr/273/4#snap_member_qualified_alien_immediately_eligible",
    "snap_member_qualified_alien_after_wait_eligible": "us:regulations/7-cfr/273/4#snap_member_qualified_alien_after_wait_eligible",
    "snap_member_qualified_alien_status_eligible": "us:regulations/7-cfr/273/4#snap_member_qualified_alien_status_eligible",
    "snap_member_alien_status_eligible": "us:regulations/7-cfr/273/4#snap_member_alien_status_eligible",
    "snap_member_citizenship_or_alien_status_eligible": "us:regulations/7-cfr/273/4#snap_member_citizenship_or_alien_status_eligible",
    "snap_student_enrollment_status_active": "us:regulations/7-cfr/273/5#snap_student_enrollment_status_active",
    "snap_member_enrolled_in_institution_of_higher_education": "us:regulations/7-cfr/273/5#snap_member_enrolled_in_institution_of_higher_education",
    "snap_student_age_exemption": "us:regulations/7-cfr/273/5#snap_student_age_exemption",
    "snap_student_physical_or_mental_unfitness_exemption": "us:regulations/7-cfr/273/5#snap_student_physical_or_mental_unfitness_exemption",
    "snap_student_tanf_exemption": "us:regulations/7-cfr/273/5#snap_student_tanf_exemption",
    "snap_student_jobs_program_exemption": "us:regulations/7-cfr/273/5#snap_student_jobs_program_exemption",
    "snap_student_employment_exemption": "us:regulations/7-cfr/273/5#snap_student_employment_exemption",
    "snap_student_work_study_exemption": "us:regulations/7-cfr/273/5#snap_student_work_study_exemption",
    "snap_student_on_the_job_training_exemption": "us:regulations/7-cfr/273/5#snap_student_on_the_job_training_exemption",
    "snap_student_dependent_under_six_exemption": "us:regulations/7-cfr/273/5#snap_student_dependent_under_six_exemption",
    "snap_student_dependent_six_to_under_twelve_exemption": "us:regulations/7-cfr/273/5#snap_student_dependent_six_to_under_twelve_exemption",
    "snap_student_single_parent_full_time_exemption": "us:regulations/7-cfr/273/5#snap_student_single_parent_full_time_exemption",
    "snap_student_employment_training_program_exemption": "us:regulations/7-cfr/273/5#snap_student_employment_training_program_exemption",
    "snap_student_exempt": "us:regulations/7-cfr/273/5#snap_student_exempt",
    "snap_member_student_ineligible": "us:regulations/7-cfr/273/5#snap_member_student_ineligible",
    "snap_member_student_eligible": "us:regulations/7-cfr/273/5#snap_member_student_eligible",
    "snap_member_ssn_good_cause_applies": "us:regulations/7-cfr/273/6#snap_member_ssn_good_cause_applies",
    "snap_member_ssn_requirement_ineligible": "us:regulations/7-cfr/273/6#snap_member_ssn_requirement_ineligible",
    "snap_member_ssn_requirement_eligible": "us:regulations/7-cfr/273/6#snap_member_ssn_requirement_eligible",
    "snap_member_general_work_requirement_exempt": "us:regulations/7-cfr/273/7#snap_member_general_work_requirement_exempt",
    "snap_member_general_work_requirement_compliant": "us:regulations/7-cfr/273/7#snap_member_general_work_requirement_compliant",
    "snap_member_general_work_requirement_waived": "us:regulations/7-cfr/273/7#snap_member_general_work_requirement_waived",
    "snap_member_general_work_requirement_eligible": "us:regulations/7-cfr/273/7#snap_member_general_work_requirement_eligible",
    "snap_resource_limit_categorical_exemption_applies": "us:regulations/7-cfr/273/8#snap_resource_limit_categorical_exemption_applies",
    "snap_financial_resources_within_limit": "us:regulations/7-cfr/273/8#snap_financial_resources_within_limit",
    "snap_resource_eligible": "us:regulations/7-cfr/273/8#snap_resource_eligible",
    "snap_standard_gross_income_eligible": "us:regulations/7-cfr/273/9#snap_standard_gross_income_eligible",
    "snap_standard_net_income_eligible": "us:regulations/7-cfr/273/9#snap_standard_net_income_eligible",
    "snap_standard_income_eligible": "us:regulations/7-cfr/273/9#snap_standard_income_eligible",
    "snap_full_excess_shelter_deduction_applies": "us:regulations/7-cfr/273/9#snap_full_excess_shelter_deduction_applies",
    "snap_total_gross_income": "us:regulations/7-cfr/273/10#snap_total_gross_income",
    "snap_earned_income_deduction_for_net_income": "us:regulations/7-cfr/273/10#snap_earned_income_deduction_for_net_income",
    "snap_excess_medical_deduction_for_net_income": "us:regulations/7-cfr/273/10#snap_excess_medical_deduction_for_net_income",
    "snap_homeless_shelter_deduction_for_net_income": "us:regulations/7-cfr/273/10#snap_homeless_shelter_deduction_for_net_income",
    "snap_net_income_before_shelter": "us:regulations/7-cfr/273/10#snap_net_income_before_shelter",
    "snap_excess_shelter_cost": "us:regulations/7-cfr/273/10#snap_excess_shelter_cost",
    "snap_excess_shelter_deduction_for_net_income": "us:regulations/7-cfr/273/10#snap_excess_shelter_deduction_for_net_income",
    "snap_net_monthly_income": "us:regulations/7-cfr/273/10#snap_net_monthly_income",
    "snap_minimum_benefit": "us:regulations/7-cfr/273/10#snap_minimum_benefit",
    "snap_calculated_monthly_allotment_before_minimums": "us:regulations/7-cfr/273/10#snap_calculated_monthly_allotment_before_minimums",
    "snap_monthly_allotment": "us:regulations/7-cfr/273/10#snap_monthly_allotment",
    "snap_member_abawd_fulfilling_work_requirement": "us:regulations/7-cfr/273/24#snap_member_abawd_fulfilling_work_requirement",
    "snap_member_abawd_exception_applies": "us:regulations/7-cfr/273/24#snap_member_abawd_exception_applies",
    "snap_member_abawd_time_limit_inapplicable": "us:regulations/7-cfr/273/24#snap_member_abawd_time_limit_inapplicable",
    "snap_member_abawd_countable_month_limit_exceeded": "us:regulations/7-cfr/273/24#snap_member_abawd_countable_month_limit_exceeded",
    "snap_member_abawd_regained_or_additional_eligibility": "us:regulations/7-cfr/273/24#snap_member_abawd_regained_or_additional_eligibility",
    "snap_member_abawd_time_limit_eligible": "us:regulations/7-cfr/273/24#snap_member_abawd_time_limit_eligible",
    "snap_member_work_requirement_eligible": "us:regulations/7-cfr/273/24#snap_member_work_requirement_eligible",
    "snap_member_work_requirement_ineligible": "us:regulations/7-cfr/273/24#snap_member_work_requirement_ineligible",
    "snap_earned_income_subject_to_deduction": "us:statutes/7/2014/e/2#snap_earned_income_subject_to_deduction",
    "snap_earned_income_deduction": "us:statutes/7/2014/e/2#snap_earned_income_deduction",
    "snap_net_income_pre_shelter": "us:statutes/7/2014/e/6/A#snap_net_income_pre_shelter",
    "snap_net_income": "us:statutes/7/2014/e/6/A#snap_net_income",
    "snap_net_income_for_allotment": "us:statutes/7/2017/a#snap_net_income_for_allotment",
    "snap_household_food_contribution": "us:statutes/7/2017/a#snap_household_food_contribution",
    "snap_allotment_before_minimum": "us:statutes/7/2017/a#snap_allotment_before_minimum",
    "snap_minimum_monthly_allotment": "us:statutes/7/2017/a#snap_minimum_monthly_allotment",
    "snap_regular_month_allotment": "us:statutes/7/2017/a#snap_regular_month_allotment",
    "initial_month_of_certification": "us-ny:regulations/18-nycrr/387/14/a/1#initial_month_of_certification",
    "initial_month_benefit_level": "us-ny:regulations/18-nycrr/387/14/a/1#initial_month_benefit_level",
    "member_has_family_assistance_nonemergency_safety_net_or_ssi_categorical_status": "us-ny:regulations/18-nycrr/387/14/a/5#member_has_family_assistance_nonemergency_safety_net_or_ssi_categorical_status",
    "ny_snap_all_members_public_assistance_categorical_path_satisfied": "us-ny:regulations/18-nycrr/387/14/a/5#ny_snap_all_members_public_assistance_categorical_path_satisfied",
    "ny_snap_categorical_gross_income_limit_200_percent_fpl": "us-ny:regulations/18-nycrr/387/14/a/5#ny_snap_categorical_gross_income_limit_200_percent_fpl",
    "ny_snap_categorical_gross_income_limit_150_percent_fpl": "us-ny:regulations/18-nycrr/387/14/a/5#ny_snap_categorical_gross_income_limit_150_percent_fpl",
    "ny_snap_categorical_gross_income_limit_130_percent_fpl": "us-ny:regulations/18-nycrr/387/14/a/5#ny_snap_categorical_gross_income_limit_130_percent_fpl",
    "ny_snap_elderly_disabled_200_percent_categorical_path_satisfied": "us-ny:regulations/18-nycrr/387/14/a/5#ny_snap_elderly_disabled_200_percent_categorical_path_satisfied",
    "ny_snap_dependent_care_200_percent_categorical_path_satisfied": "us-ny:regulations/18-nycrr/387/14/a/5#ny_snap_dependent_care_200_percent_categorical_path_satisfied",
    "ny_snap_earned_income_150_percent_categorical_path_satisfied": "us-ny:regulations/18-nycrr/387/14/a/5#ny_snap_earned_income_150_percent_categorical_path_satisfied",
    "ny_snap_residual_130_percent_categorical_path_satisfied": "us-ny:regulations/18-nycrr/387/14/a/5#ny_snap_residual_130_percent_categorical_path_satisfied",
    "ny_snap_categorically_eligible": "us-ny:regulations/18-nycrr/387/14/a/5#ny_snap_categorically_eligible",
    "snap_categorically_eligible_for_resource_exemption": "us-ny:regulations/18-nycrr/387/14/a/5#snap_categorically_eligible_for_resource_exemption",
    "snap_income_limit_exemption_for_categorically_eligible_household": "us-ny:regulations/18-nycrr/387/14/a/5#snap_income_limit_exemption_for_categorically_eligible_household",
    "snap_allowable_shelter_costs": "us-ny:regulations/18-nycrr/387/12/f/3/vi#snap_allowable_shelter_costs",
    "snap_heating_cooling_standard_allowance_eligible": "us-ny:regulations/18-nycrr/387/12/f/3/v/a#snap_heating_cooling_standard_allowance_eligible",
    "snap_standard_utility_allowance": "us-ny:regulations/18-nycrr/387/12/f/3/v/a#snap_standard_utility_allowance",
    "snap_utilities_standard_allowance_eligible": "us-ny:regulations/18-nycrr/387/12/f/3/v/b#snap_utilities_standard_allowance_eligible",
    "snap_limited_utility_allowance": "us-ny:regulations/18-nycrr/387/12/f/3/v/b#snap_limited_utility_allowance",
    "snap_telephone_standard_allowance_eligible": "us-ny:regulations/18-nycrr/387/12/f/3/v/c#snap_telephone_standard_allowance_eligible",
    "snap_individual_utility_allowance": "us-ny:regulations/18-nycrr/387/12/f/3/v/c#snap_individual_utility_allowance",
    "shelter_costs": "us-ny:policies/otda/snap/fy-2026-benefit-calculation#shelter_costs",
    "snap_gross_monthly_income": "us-ny:policies/otda/snap/fy-2026-benefit-calculation#snap_gross_monthly_income",
    "snap_monthly_household_income": "us-ny:policies/otda/snap/fy-2026-benefit-calculation#snap_monthly_household_income",
    "ny_snap_excess_shelter_cost": "us-ny:policies/otda/snap/fy-2026-benefit-calculation#ny_snap_excess_shelter_cost",
    "snap_excess_shelter_deduction": "us-ny:policies/otda/snap/fy-2026-benefit-calculation#snap_excess_shelter_deduction",
    "snap_initial_month_allotment_after_minimum_issuance": "us-ny:policies/otda/snap/fy-2026-benefit-calculation#snap_initial_month_allotment_after_minimum_issuance",
    "snap_ssn_eligible": "us-ny:policies/otda/snap/fy-2026-benefit-calculation#snap_ssn_eligible",
    "snap_residency_citizenship_eligible": "us-ny:policies/otda/snap/fy-2026-benefit-calculation#snap_residency_citizenship_eligible",
    "snap_work_requirement_eligible": "us-ny:policies/otda/snap/fy-2026-benefit-calculation#snap_work_requirement_eligible",
    "snap_student_eligible": "us-ny:policies/otda/snap/fy-2026-benefit-calculation#snap_student_eligible",
    "snap_eligible": "us-ny:policies/otda/snap/fy-2026-benefit-calculation#snap_eligible"
  },
  "all_outputs": [
    "us-ny:policies/otda/snap/fy-2026-benefit-calculation#ny_snap_excess_shelter_cost",
    "us-ny:policies/otda/snap/fy-2026-benefit-calculation#shelter_costs",
    "us-ny:policies/otda/snap/fy-2026-benefit-calculation#snap_eligible",
    "us-ny:policies/otda/snap/fy-2026-benefit-calculation#snap_excess_shelter_deduction",
    "us-ny:policies/otda/snap/fy-2026-benefit-calculation#snap_gross_monthly_income",
    "us-ny:policies/otda/snap/fy-2026-benefit-calculation#snap_initial_month_allotment_after_minimum_issuance",
    "us-ny:policies/otda/snap/fy-2026-benefit-calculation#snap_monthly_household_income",
    "us-ny:policies/otda/snap/fy-2026-benefit-calculation#snap_residency_citizenship_eligible",
    "us-ny:policies/otda/snap/fy-2026-benefit-calculation#snap_ssn_eligible",
    "us-ny:policies/otda/snap/fy-2026-benefit-calculation#snap_student_eligible",
    "us-ny:policies/otda/snap/fy-2026-benefit-calculation#snap_work_requirement_eligible",
    "us-ny:regulations/18-nycrr/387/12/f/3/v/a#snap_heating_cooling_standard_allowance_eligible",
    "us-ny:regulations/18-nycrr/387/12/f/3/v/a#snap_standard_utility_allowance",
    "us-ny:regulations/18-nycrr/387/12/f/3/v/b#snap_limited_utility_allowance",
    "us-ny:regulations/18-nycrr/387/12/f/3/v/b#snap_utilities_standard_allowance_eligible",
    "us-ny:regulations/18-nycrr/387/12/f/3/v/c#snap_individual_utility_allowance",
    "us-ny:regulations/18-nycrr/387/12/f/3/v/c#snap_telephone_standard_allowance_eligible",
    "us-ny:regulations/18-nycrr/387/12/f/3/vi#snap_allowable_shelter_costs",
    "us-ny:regulations/18-nycrr/387/14/a/1#initial_month_benefit_level",
    "us-ny:regulations/18-nycrr/387/14/a/1#initial_month_of_certification",
    "us-ny:regulations/18-nycrr/387/14/a/5#member_has_family_assistance_nonemergency_safety_net_or_ssi_categorical_status",
    "us-ny:regulations/18-nycrr/387/14/a/5#ny_snap_all_members_public_assistance_categorical_path_satisfied",
    "us-ny:regulations/18-nycrr/387/14/a/5#ny_snap_categorical_gross_income_limit_130_percent_fpl",
    "us-ny:regulations/18-nycrr/387/14/a/5#ny_snap_categorical_gross_income_limit_150_percent_fpl",
    "us-ny:regulations/18-nycrr/387/14/a/5#ny_snap_categorical_gross_income_limit_200_percent_fpl",
    "us-ny:regulations/18-nycrr/387/14/a/5#ny_snap_categorically_eligible",
    "us-ny:regulations/18-nycrr/387/14/a/5#ny_snap_dependent_care_200_percent_categorical_path_satisfied",
    "us-ny:regulations/18-nycrr/387/14/a/5#ny_snap_earned_income_150_percent_categorical_path_satisfied",
    "us-ny:regulations/18-nycrr/387/14/a/5#ny_snap_elderly_disabled_200_percent_categorical_path_satisfied",
    "us-ny:regulations/18-nycrr/387/14/a/5#ny_snap_residual_130_percent_categorical_path_satisfied",
    "us-ny:regulations/18-nycrr/387/14/a/5#snap_categorically_eligible_for_resource_exemption",
    "us-ny:regulations/18-nycrr/387/14/a/5#snap_income_limit_exemption_for_categorically_eligible_household",
    "us:policies/usda/snap/fy-2026-cola/deductions#snap_asset_limit",
    "us:policies/usda/snap/fy-2026-cola/deductions#snap_standard_deduction",
    "us:policies/usda/snap/fy-2026-cola/deductions#snap_standard_deduction_48_states_dc",
    "us:policies/usda/snap/fy-2026-cola/income-eligibility-standards#snap_gross_income_limit_130_percent_fpl_48_states_dc",
    "us:policies/usda/snap/fy-2026-cola/income-eligibility-standards#snap_gross_income_limit_165_percent_fpl_48_states_dc",
    "us:policies/usda/snap/fy-2026-cola/income-eligibility-standards#snap_net_income_limit_100_percent_fpl_48_states_dc",
    "us:policies/usda/snap/fy-2026-cola/maximum-allotments#snap_maximum_allotment",
    "us:policies/usda/snap/fy-2026-cola/maximum-allotments#snap_one_person_thrifty_food_plan_cost",
    "us:regulations/7-cfr/273/10#snap_calculated_monthly_allotment_before_minimums",
    "us:regulations/7-cfr/273/10#snap_earned_income_deduction_for_net_income",
    "us:regulations/7-cfr/273/10#snap_excess_medical_deduction_for_net_income",
    "us:regulations/7-cfr/273/10#snap_excess_shelter_cost",
    "us:regulations/7-cfr/273/10#snap_excess_shelter_deduction_for_net_income",
    "us:regulations/7-cfr/273/10#snap_homeless_shelter_deduction_for_net_income",
    "us:regulations/7-cfr/273/10#snap_minimum_benefit",
    "us:regulations/7-cfr/273/10#snap_monthly_allotment",
    "us:regulations/7-cfr/273/10#snap_net_income_before_shelter",
    "us:regulations/7-cfr/273/10#snap_net_monthly_income",
    "us:regulations/7-cfr/273/10#snap_total_gross_income",
    "us:regulations/7-cfr/273/24#snap_member_abawd_countable_month_limit_exceeded",
    "us:regulations/7-cfr/273/24#snap_member_abawd_exception_applies",
    "us:regulations/7-cfr/273/24#snap_member_abawd_fulfilling_work_requirement",
    "us:regulations/7-cfr/273/24#snap_member_abawd_regained_or_additional_eligibility",
    "us:regulations/7-cfr/273/24#snap_member_abawd_time_limit_eligible",
    "us:regulations/7-cfr/273/24#snap_member_abawd_time_limit_inapplicable",
    "us:regulations/7-cfr/273/24#snap_member_work_requirement_eligible",
    "us:regulations/7-cfr/273/24#snap_member_work_requirement_ineligible",
    "us:regulations/7-cfr/273/3#snap_duplicate_participation_exception_applies",
    "us:regulations/7-cfr/273/3#snap_household_duplicate_participation_barred",
    "us:regulations/7-cfr/273/3#snap_household_residency_eligible",
    "us:regulations/7-cfr/273/3#snap_household_state_resident",
    "us:regulations/7-cfr/273/4#snap_member_alien_status_eligible",
    "us:regulations/7-cfr/273/4#snap_member_citizen_or_national_status_eligible",
    "us:regulations/7-cfr/273/4#snap_member_citizenship_or_alien_status_eligible",
    "us:regulations/7-cfr/273/4#snap_member_qualified_alien_after_wait_eligible",
    "us:regulations/7-cfr/273/4#snap_member_qualified_alien_immediately_eligible",
    "us:regulations/7-cfr/273/4#snap_member_qualified_alien_status_eligible",
    "us:regulations/7-cfr/273/4#snap_member_special_nonqualified_alien_status_eligible",
    "us:regulations/7-cfr/273/5#snap_member_enrolled_in_institution_of_higher_education",
    "us:regulations/7-cfr/273/5#snap_member_student_eligible",
    "us:regulations/7-cfr/273/5#snap_member_student_ineligible",
    "us:regulations/7-cfr/273/5#snap_student_age_exemption",
    "us:regulations/7-cfr/273/5#snap_student_dependent_six_to_under_twelve_exemption",
    "us:regulations/7-cfr/273/5#snap_student_dependent_under_six_exemption",
    "us:regulations/7-cfr/273/5#snap_student_employment_exemption",
    "us:regulations/7-cfr/273/5#snap_student_employment_training_program_exemption",
    "us:regulations/7-cfr/273/5#snap_student_enrollment_status_active",
    "us:regulations/7-cfr/273/5#snap_student_exempt",
    "us:regulations/7-cfr/273/5#snap_student_jobs_program_exemption",
    "us:regulations/7-cfr/273/5#snap_student_on_the_job_training_exemption",
    "us:regulations/7-cfr/273/5#snap_student_physical_or_mental_unfitness_exemption",
    "us:regulations/7-cfr/273/5#snap_student_single_parent_full_time_exemption",
    "us:regulations/7-cfr/273/5#snap_student_tanf_exemption",
    "us:regulations/7-cfr/273/5#snap_student_work_study_exemption",
    "us:regulations/7-cfr/273/6#snap_member_ssn_good_cause_applies",
    "us:regulations/7-cfr/273/6#snap_member_ssn_requirement_eligible",
    "us:regulations/7-cfr/273/6#snap_member_ssn_requirement_ineligible",
    "us:regulations/7-cfr/273/7#snap_member_general_work_requirement_compliant",
    "us:regulations/7-cfr/273/7#snap_member_general_work_requirement_eligible",
    "us:regulations/7-cfr/273/7#snap_member_general_work_requirement_exempt",
    "us:regulations/7-cfr/273/7#snap_member_general_work_requirement_waived",
    "us:regulations/7-cfr/273/8#snap_financial_resources_within_limit",
    "us:regulations/7-cfr/273/8#snap_resource_eligible",
    "us:regulations/7-cfr/273/8#snap_resource_limit_categorical_exemption_applies",
    "us:regulations/7-cfr/273/9#snap_full_excess_shelter_deduction_applies",
    "us:regulations/7-cfr/273/9#snap_standard_gross_income_eligible",
    "us:regulations/7-cfr/273/9#snap_standard_income_eligible",
    "us:regulations/7-cfr/273/9#snap_standard_net_income_eligible",
    "us:statutes/7/2012/j#snap_household_has_elderly_or_disabled_member",
    "us:statutes/7/2014/e/2#snap_earned_income_deduction",
    "us:statutes/7/2014/e/2#snap_earned_income_subject_to_deduction",
    "us:statutes/7/2014/e/6/A#snap_net_income",
    "us:statutes/7/2014/e/6/A#snap_net_income_pre_shelter",
    "us:statutes/7/2017/a#snap_allotment_before_minimum",
    "us:statutes/7/2017/a#snap_household_food_contribution",
    "us:statutes/7/2017/a#snap_minimum_monthly_allotment",
    "us:statutes/7/2017/a#snap_net_income_for_allotment",
    "us:statutes/7/2017/a#snap_regular_month_allotment"
  ]
} as const;

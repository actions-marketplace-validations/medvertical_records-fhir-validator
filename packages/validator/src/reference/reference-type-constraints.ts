export interface ReferenceTypeConstraint {
  targetTypes: string[];
  targetProfiles?: string[];
  requireType?: boolean;
  fieldPath: string;
  required?: boolean;
}

export const REFERENCE_TYPE_CONSTRAINTS: Record<string, Record<string, ReferenceTypeConstraint>> = {
  Patient: {
    generalPractitioner: {
      fieldPath: 'generalPractitioner',
      targetTypes: ['Practitioner', 'PractitionerRole', 'Organization'],
      required: false,
    },
    managingOrganization: {
      fieldPath: 'managingOrganization',
      targetTypes: ['Organization'],
      required: false,
    },
    'link.other': {
      fieldPath: 'link.other',
      targetTypes: ['Patient', 'RelatedPerson'],
      required: false,
    },
  },
  Observation: {
    subject: {
      fieldPath: 'subject',
      targetTypes: ['Patient', 'Group', 'Device', 'Location'],
      required: false,
    },
    encounter: { fieldPath: 'encounter', targetTypes: ['Encounter'], required: false },
    performer: {
      fieldPath: 'performer',
      targetTypes: ['Practitioner', 'PractitionerRole', 'Organization', 'CareTeam', 'Patient', 'RelatedPerson'],
      required: false,
    },
    specimen: { fieldPath: 'specimen', targetTypes: ['Specimen'], required: false },
    device: { fieldPath: 'device', targetTypes: ['Device', 'DeviceMetric'], required: false },
    hasMember: {
      fieldPath: 'hasMember',
      targetTypes: ['Observation', 'QuestionnaireResponse', 'MolecularSequence'],
      required: false,
    },
    derivedFrom: {
      fieldPath: 'derivedFrom',
      targetTypes: ['DocumentReference', 'ImagingStudy', 'Media', 'QuestionnaireResponse', 'Observation', 'MolecularSequence'],
      required: false,
    },
    focus: { fieldPath: 'focus', targetTypes: ['Resource'], required: false },
  },
  Condition: {
    subject: { fieldPath: 'subject', targetTypes: ['Patient', 'Group'], required: true },
    encounter: { fieldPath: 'encounter', targetTypes: ['Encounter'], required: false },
    recorder: {
      fieldPath: 'recorder',
      targetTypes: ['Practitioner', 'PractitionerRole', 'Patient', 'RelatedPerson'],
      required: false,
    },
    asserter: {
      fieldPath: 'asserter',
      targetTypes: ['Practitioner', 'PractitionerRole', 'Patient', 'RelatedPerson'],
      required: false,
    },
    'stage.assessment': {
      fieldPath: 'stage.assessment',
      targetTypes: ['ClinicalImpression', 'DiagnosticReport', 'Observation'],
      required: false,
    },
    'evidence.detail': { fieldPath: 'evidence.detail', targetTypes: ['Resource'], required: false },
  },
  Encounter: {
    subject: { fieldPath: 'subject', targetTypes: ['Patient', 'Group'], required: false },
    episodeOfCare: { fieldPath: 'episodeOfCare', targetTypes: ['EpisodeOfCare'], required: false },
    basedOn: { fieldPath: 'basedOn', targetTypes: ['ServiceRequest'], required: false },
    'participant.individual': {
      fieldPath: 'participant.individual',
      targetTypes: ['Practitioner', 'PractitionerRole', 'RelatedPerson'],
      required: false,
    },
    appointment: { fieldPath: 'appointment', targetTypes: ['Appointment'], required: false },
    reasonReference: {
      fieldPath: 'reasonReference',
      targetTypes: ['Condition', 'Procedure', 'Observation', 'ImmunizationRecommendation'],
      required: false,
    },
    account: { fieldPath: 'account', targetTypes: ['Account'], required: false },
    serviceProvider: { fieldPath: 'serviceProvider', targetTypes: ['Organization'], required: false },
    partOf: { fieldPath: 'partOf', targetTypes: ['Encounter'], required: false },
  },
  DiagnosticReport: {
    subject: {
      fieldPath: 'subject',
      targetTypes: ['Patient', 'Group', 'Device', 'Location'],
      required: false,
    },
    encounter: { fieldPath: 'encounter', targetTypes: ['Encounter'], required: false },
    performer: {
      fieldPath: 'performer',
      targetTypes: ['Practitioner', 'PractitionerRole', 'Organization', 'CareTeam'],
      required: false,
    },
    resultsInterpreter: {
      fieldPath: 'resultsInterpreter',
      targetTypes: ['Practitioner', 'PractitionerRole', 'Organization', 'CareTeam'],
      required: false,
    },
    specimen: { fieldPath: 'specimen', targetTypes: ['Specimen'], required: false },
    result: { fieldPath: 'result', targetTypes: ['Observation'], required: false },
    imagingStudy: { fieldPath: 'imagingStudy', targetTypes: ['ImagingStudy'], required: false },
    'media.link': { fieldPath: 'media.link', targetTypes: ['Media'], required: false },
  },
};

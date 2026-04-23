/**
* This file was @generated using pocketbase-typegen
*/

import type PocketBase from 'pocketbase'
import type { RecordService } from 'pocketbase'

export const Collections = {
	Authorigins: "_authOrigins",
	Externalauths: "_externalAuths",
	Mfas: "_mfas",
	Otps: "_otps",
	Superusers: "_superusers",
	Applications: "applications",
	CvTemplates: "cv_templates",
	CvVersions: "cv_versions",
	Events: "events",
	Jobs: "jobs",
	Users: "users",
} as const
export type Collections = typeof Collections[keyof typeof Collections]

// Alias types for improved usability
export type IsoDateString = string
export type IsoAutoDateString = string & { readonly autodate: unique symbol }
export type RecordIdString = string
export type FileNameString = string & { readonly filename: unique symbol }
export type HTMLString = string

type ExpandType<T> = unknown extends T
	? T extends unknown
		? { expand?: unknown }
		: { expand: T }
	: { expand: T }

// System fields
export type BaseSystemFields<T = unknown> = {
	id: RecordIdString
	collectionId: string
	collectionName: Collections
} & ExpandType<T>

export type AuthSystemFields<T = unknown> = {
	email: string
	emailVisibility: boolean
	username: string
	verified: boolean
} & BaseSystemFields<T>

// Record types for each collection

export type AuthoriginsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	fingerprint: string
	id: string
	recordRef: string
	updated: IsoAutoDateString
}

export type ExternalauthsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	provider: string
	providerId: string
	recordRef: string
	updated: IsoAutoDateString
}

export type MfasRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	method: string
	recordRef: string
	updated: IsoAutoDateString
}

export type OtpsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	password: string
	recordRef: string
	sentTo?: string
	updated: IsoAutoDateString
}

export type SuperusersRecord = {
	created: IsoAutoDateString
	email: string
	emailVisibility?: boolean
	id: string
	password: string
	tokenKey: string
	updated: IsoAutoDateString
	verified?: boolean
}

export const ApplicationsJdSourceOptions = {
	"manual": "manual",
	"career-ops-scan": "career-ops-scan",
	"paste": "paste",
} as const
export type ApplicationsJdSourceOptions = typeof ApplicationsJdSourceOptions[keyof typeof ApplicationsJdSourceOptions]

export const ApplicationsStatusOptions = {
	"discovered": "discovered",
	"evaluated": "evaluated",
	"applied": "applied",
	"interview": "interview",
	"offer": "offer",
	"rejected": "rejected",
	"withdrawn": "withdrawn",
} as const
export type ApplicationsStatusOptions = typeof ApplicationsStatusOptions[keyof typeof ApplicationsStatusOptions]
export type ApplicationsRecord = {
	applied_at?: IsoDateString
	archetype?: string
	comp_range?: string
	company: string
	cv_version?: RecordIdString
	evaluation_report_md?: string
	evaluation_report_path?: string
	fit_score?: number
	id: string
	jd_source?: ApplicationsJdSourceOptions
	jd_text?: string
	jd_url?: string
	location?: string
	notes?: string
	pinned?: boolean
	role: string
	status: ApplicationsStatusOptions
}

export type CvTemplatesRecord = {
	css: string
	html_template: string
	id: string
	is_default?: boolean
	name: string
	preview_image?: FileNameString
	slug: string
}

export const CvVersionsSourceOptions = {
	"base": "base",
	"tailored": "tailored",
	"manual_edit": "manual_edit",
} as const
export type CvVersionsSourceOptions = typeof CvVersionsSourceOptions[keyof typeof CvVersionsSourceOptions]
export type CvVersionsRecord = {
	id: string
	label: string
	markdown: string
	parent?: RecordIdString
	pdf?: FileNameString
	source: CvVersionsSourceOptions
	target_archetype?: string
	template?: RecordIdString
}

export const EventsTypeOptions = {
	"created": "created",
	"evaluated": "evaluated",
	"applied": "applied",
	"interview_scheduled": "interview_scheduled",
	"interview_done": "interview_done",
	"rejected": "rejected",
	"offer_received": "offer_received",
	"offer_accepted": "offer_accepted",
	"offer_declined": "offer_declined",
	"withdrawn": "withdrawn",
	"note_added": "note_added",
	"status_changed": "status_changed",
} as const
export type EventsTypeOptions = typeof EventsTypeOptions[keyof typeof EventsTypeOptions]
export type EventsRecord<Tpayload = unknown> = {
	application: RecordIdString
	id: string
	occurred_at: IsoDateString
	payload?: null | Tpayload
	type: EventsTypeOptions
}

export const JobsTypeOptions = {
	"evaluate_jd": "evaluate_jd",
	"generate_pdf": "generate_pdf",
	"rescan_tracker": "rescan_tracker",
	"regenerate_cv": "regenerate_cv",
} as const
export type JobsTypeOptions = typeof JobsTypeOptions[keyof typeof JobsTypeOptions]

export const JobsStatusOptions = {
	"queued": "queued",
	"running": "running",
	"done": "done",
	"failed": "failed",
	"cancelled": "cancelled",
} as const
export type JobsStatusOptions = typeof JobsStatusOptions[keyof typeof JobsStatusOptions]
export type JobsRecord<Tinput = unknown, Toutput = unknown> = {
	application?: RecordIdString
	error?: string
	finished_at?: IsoDateString
	id: string
	input?: null | Tinput
	log?: string
	output?: null | Toutput
	started_at?: IsoDateString
	status: JobsStatusOptions
	type: JobsTypeOptions
}

export type UsersRecord = {
	avatar?: FileNameString
	created: IsoAutoDateString
	email: string
	emailVisibility?: boolean
	id: string
	name?: string
	password: string
	tokenKey: string
	updated: IsoAutoDateString
	verified?: boolean
}

// Response types include system fields and match responses from the PocketBase API
export type AuthoriginsResponse<Texpand = unknown> = Required<AuthoriginsRecord> & BaseSystemFields<Texpand>
export type ExternalauthsResponse<Texpand = unknown> = Required<ExternalauthsRecord> & BaseSystemFields<Texpand>
export type MfasResponse<Texpand = unknown> = Required<MfasRecord> & BaseSystemFields<Texpand>
export type OtpsResponse<Texpand = unknown> = Required<OtpsRecord> & BaseSystemFields<Texpand>
export type SuperusersResponse<Texpand = unknown> = Required<SuperusersRecord> & AuthSystemFields<Texpand>
export type ApplicationsResponse<Texpand = unknown> = Required<ApplicationsRecord> & BaseSystemFields<Texpand>
export type CvTemplatesResponse<Texpand = unknown> = Required<CvTemplatesRecord> & BaseSystemFields<Texpand>
export type CvVersionsResponse<Texpand = unknown> = Required<CvVersionsRecord> & BaseSystemFields<Texpand>
export type EventsResponse<Tpayload = unknown, Texpand = unknown> = Required<EventsRecord<Tpayload>> & BaseSystemFields<Texpand>
export type JobsResponse<Tinput = unknown, Toutput = unknown, Texpand = unknown> = Required<JobsRecord<Tinput, Toutput>> & BaseSystemFields<Texpand>
export type UsersResponse<Texpand = unknown> = Required<UsersRecord> & AuthSystemFields<Texpand>

// Types containing all Records and Responses, useful for creating typing helper functions

export type CollectionRecords = {
	_authOrigins: AuthoriginsRecord
	_externalAuths: ExternalauthsRecord
	_mfas: MfasRecord
	_otps: OtpsRecord
	_superusers: SuperusersRecord
	applications: ApplicationsRecord
	cv_templates: CvTemplatesRecord
	cv_versions: CvVersionsRecord
	events: EventsRecord
	jobs: JobsRecord
	users: UsersRecord
}

export type CollectionResponses = {
	_authOrigins: AuthoriginsResponse
	_externalAuths: ExternalauthsResponse
	_mfas: MfasResponse
	_otps: OtpsResponse
	_superusers: SuperusersResponse
	applications: ApplicationsResponse
	cv_templates: CvTemplatesResponse
	cv_versions: CvVersionsResponse
	events: EventsResponse
	jobs: JobsResponse
	users: UsersResponse
}

// Utility types for create/update operations

type ProcessCreateAndUpdateFields<T> = Omit<{
	// Omit AutoDate fields
	[K in keyof T as Extract<T[K], IsoAutoDateString> extends never ? K : never]: 
		// Convert FileNameString to File
		T[K] extends infer U ? 
			U extends (FileNameString | FileNameString[]) ? 
				U extends any[] ? File[] : File 
			: U
		: never
}, 'id'>

// Create type for Auth collections
export type CreateAuth<T> = {
	id?: RecordIdString
	email: string
	emailVisibility?: boolean
	password: string
	passwordConfirm: string
	verified?: boolean
} & ProcessCreateAndUpdateFields<T>

// Create type for Base collections
export type CreateBase<T> = {
	id?: RecordIdString
} & ProcessCreateAndUpdateFields<T>

// Update type for Auth collections
export type UpdateAuth<T> = Partial<
	Omit<ProcessCreateAndUpdateFields<T>, keyof AuthSystemFields>
> & {
	email?: string
	emailVisibility?: boolean
	oldPassword?: string
	password?: string
	passwordConfirm?: string
	verified?: boolean
}

// Update type for Base collections
export type UpdateBase<T> = Partial<
	Omit<ProcessCreateAndUpdateFields<T>, keyof BaseSystemFields>
>

// Get the correct create type for any collection
export type Create<T extends keyof CollectionResponses> =
	CollectionResponses[T] extends AuthSystemFields
		? CreateAuth<CollectionRecords[T]>
		: CreateBase<CollectionRecords[T]>

// Get the correct update type for any collection
export type Update<T extends keyof CollectionResponses> =
	CollectionResponses[T] extends AuthSystemFields
		? UpdateAuth<CollectionRecords[T]>
		: UpdateBase<CollectionRecords[T]>

// Type for usage with type asserted PocketBase instance
// https://github.com/pocketbase/js-sdk#specify-typescript-definitions

export type TypedPocketBase = {
	collection<T extends keyof CollectionResponses>(
		idOrName: T
	): RecordService<CollectionResponses[T]>
} & PocketBase

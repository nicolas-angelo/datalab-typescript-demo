import { z } from 'zod'

export const ResumeSchema = z.object({
  name: z.string(),
  headline: z.string(),
  contact: z.object({
    email: z.string().nullable(),
    phone: z.string().nullable(),
    location: z.string().nullable(),
    linkedin: z.string().nullable(),
  }),
  summary: z.string(),
  experience: z.array(
    z.object({
      title: z.string(),
      company: z.string(),
      location: z.string().nullable(),
      startDate: z.string(),
      endDate: z.string(),
      highlights: z.array(z.string()),
    })
  ),
  skills: z.array(z.string()),
  education: z.array(
    z.object({
      school: z.string(),
      field: z.string().nullable(),
      startDate: z.string().nullable(),
      endDate: z.string().nullable(),
    })
  ),
  publications: z.array(
    z.object({
      title: z.string(),
      url: z.string().nullable(),
    })
  ),
  certifications: z.array(z.string()),
})

export type Resume = z.infer<typeof ResumeSchema>

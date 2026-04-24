import product from './product'
import category from './category'
import heroSection from './heroSection'
import aboutSection from './aboutSection'
import siteSettings from './siteSettings'
import post from './post'
import testimonial from './testimonial'

export const schemaTypes = [
  // Content types
  product,
  category,
  post,
  testimonial,

  // Page sections (singletons)
  heroSection,
  aboutSection,
  siteSettings,
]

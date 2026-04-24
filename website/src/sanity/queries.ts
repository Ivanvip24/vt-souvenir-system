import { groq } from 'next-sanity'

// Products
export const productsQuery = groq`
  *[_type == "product" && inStock == true] | order(featured desc, _createdAt desc) {
    _id,
    name,
    slug,
    description,
    price,
    wholesalePrice,
    destination,
    featured,
    "category": category->{ name, slug, color },
    "images": images[]{
      asset->{url},
      alt
    }
  }
`

export const featuredProductsQuery = groq`
  *[_type == "product" && featured == true && inStock == true] | order(_createdAt desc)[0...8] {
    _id,
    name,
    slug,
    description,
    price,
    destination,
    "category": category->{ name, slug, color },
    "image": images[0]{
      asset->{url},
      alt
    }
  }
`

export const productBySlugQuery = groq`
  *[_type == "product" && slug.current == $slug][0] {
    _id,
    name,
    slug,
    description,
    price,
    wholesalePrice,
    destination,
    tags,
    "category": category->{ name, slug, color },
    "images": images[]{
      asset->{url},
      alt
    }
  }
`

// Categories
export const categoriesQuery = groq`
  *[_type == "category"] | order(order asc) {
    _id,
    name,
    slug,
    description,
    color,
    "image": image.asset->{url}
  }
`

// Hero Section
export const heroQuery = groq`
  *[_type == "heroSection"][0] {
    badge,
    headline,
    subheadline,
    ctaPrimary,
    ctaSecondary,
    "backgroundImage": backgroundImage.asset->{url},
    trustIndicators
  }
`

// About Section
export const aboutQuery = groq`
  *[_type == "aboutSection"][0] {
    badge,
    headline,
    content,
    quote,
    "image": image.asset->{url},
    stats
  }
`

// Site Settings
export const siteSettingsQuery = groq`
  *[_type == "siteSettings"][0] {
    siteName,
    tagline,
    description,
    "logo": logo.asset->{url},
    "favicon": favicon.asset->{url},
    contact,
    social,
    announcement
  }
`

// Blog Posts
export const postsQuery = groq`
  *[_type == "post"] | order(publishedAt desc) {
    _id,
    title,
    slug,
    excerpt,
    publishedAt,
    featured,
    tags,
    "coverImage": coverImage.asset->{url}
  }
`

export const postBySlugQuery = groq`
  *[_type == "post" && slug.current == $slug][0] {
    _id,
    title,
    slug,
    excerpt,
    content,
    publishedAt,
    tags,
    "coverImage": coverImage.asset->{url}
  }
`

// Testimonials
export const testimonialsQuery = groq`
  *[_type == "testimonial"] | order(featured desc, _createdAt desc) {
    _id,
    name,
    role,
    quote,
    rating,
    "avatar": avatar.asset->{url}
  }
`

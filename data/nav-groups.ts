export interface NavGroup {
  slug: string;
  name: string;
  sortOrder: number;
}

// Only groups that have at least one product (ADR-021): toys never had a
// source category; pets-automotive lost both vehicle+motorcycle to exclusion;
// furniture (5 products) merged into home-kitchen (Slice 2 follow-up) -> 6 groups.
export const navGroups: NavGroup[] = [
  { slug: "electronics", name: "Electronics", sortOrder: 1 },
  { slug: "home-kitchen", name: "Home & Kitchen", sortOrder: 2 },
  { slug: "fashion", name: "Fashion", sortOrder: 3 },
  { slug: "beauty", name: "Beauty", sortOrder: 4 },
  { slug: "grocery", name: "Grocery", sortOrder: 5 },
  { slug: "sports", name: "Sports", sortOrder: 6 },
];

// Every NON-excluded source category maps to exactly one group; excluded
// source categories (ADR-021) must NOT appear here — fetch-seed asserts both.
export const categoryToNavGroup: Record<string, string> = {
  laptops: "electronics",
  smartphones: "electronics",
  tablets: "electronics",
  "mobile-accessories": "electronics",

  "home-decoration": "home-kitchen",
  "kitchen-accessories": "home-kitchen",

  tops: "fashion",
  "mens-shirts": "fashion",
  "mens-shoes": "fashion",
  "mens-watches": "fashion",
  "womens-bags": "fashion",
  "womens-dresses": "fashion",
  "womens-jewellery": "fashion",
  "womens-shoes": "fashion",
  "womens-watches": "fashion",
  sunglasses: "fashion",

  beauty: "beauty",
  "skin-care": "beauty",
  fragrances: "beauty",

  groceries: "grocery",

  "sports-accessories": "sports",

  furniture: "home-kitchen",
};

export interface NavGroup {
  slug: string;
  name: string;
  sortOrder: number;
}

export const navGroups: NavGroup[] = [
  { slug: "electronics", name: "Electronics", sortOrder: 1 },
  { slug: "home-kitchen", name: "Home & Kitchen", sortOrder: 2 },
  { slug: "fashion", name: "Fashion", sortOrder: 3 },
  { slug: "beauty", name: "Beauty", sortOrder: 4 },
  { slug: "grocery", name: "Grocery", sortOrder: 5 },
  { slug: "sports", name: "Sports", sortOrder: 6 },
  { slug: "toys", name: "Toys", sortOrder: 7 },
  { slug: "pets-automotive", name: "Pets & Automotive", sortOrder: 8 },
  { slug: "furniture", name: "Furniture", sortOrder: 9 },
];

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

  motorcycle: "pets-automotive",
  vehicle: "pets-automotive",

  furniture: "furniture",
  // "toys" nav group has no source category — ships empty (DummyJSON has none)
};

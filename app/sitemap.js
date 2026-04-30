import { SITE_URL } from "@/lib/site";

export default function sitemap() {
  const lastModified = new Date();

  return [
    {
      url: SITE_URL,
      lastModified,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/llms.txt`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/summary.json`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.7,
    },
  ];
}

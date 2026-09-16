export const PUBLIC_HOST = process.env.NEXT_PUBLIC_METRODRAW_HOST || "metrodraw.com";
export const shortUrl = (id: string) => `${PUBLIC_HOST}/m/${id}`;

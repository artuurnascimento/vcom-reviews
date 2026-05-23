const STAR_PATH =
  "M9.2 27L16 21.807 22.797 27 20.202 18.596 27 13.403h-8.402L16 5l-2.597 8.403H5l6.798 5.193L9.2 27z";

type Props = {
  rating: number;
  size?: number;
  fillColor?: string;
  emptyColor?: string;
};

export function ReviewStars({
  rating,
  size = 18,
  fillColor = "#1d8a42",
  emptyColor = "#dcdce6",
}: Props) {
  return (
    <span style={{ display: "inline-flex", gap: 2, verticalAlign: "middle" }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const starMin = i - 1;
        const full = rating >= i;
        const partial = rating > starMin && rating < i;
        const fillWidth = partial ? (rating - starMin) * 32 : full ? 32 : 0;
        return (
          <svg
            key={i}
            width={size}
            height={size}
            viewBox="0 0 32 32"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
          >
            <rect width={32} height={32} fill={emptyColor} />
            {fillWidth > 0 ? <rect width={fillWidth} height={32} fill={fillColor} /> : null}
            <path d={STAR_PATH} fill="#fff" />
          </svg>
        );
      })}
    </span>
  );
}

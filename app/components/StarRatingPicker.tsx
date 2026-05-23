/** Mesmos SVGs 32×32 de sections/product-reviews.liquid */
const STAR_PATH =
  "M9.2 27L16 21.807 22.797 27 20.202 18.596 27 13.403h-8.402L16 5l-2.597 8.403H5l6.798 5.193L9.2 27z";

type Props = {
  value: number;
  onChange: (value: number) => void;
  fillColor?: string;
  emptyColor?: string;
};

export function StarRatingPicker({
  value,
  onChange,
  fillColor = "#1d8a42",
  emptyColor = "#dcdce6",
}: Props) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const starMin = i - 1;
        const full = value >= i;
        const partial = value > starMin && value < i;
        const fillWidth = partial ? (value - starMin) * 32 : full ? 32 : 0;
        return (
          <button
            key={i}
            type="button"
            aria-label={`${i} estrelas`}
            style={{
              padding: 0,
              border: "none",
              background: "none",
              cursor: "pointer",
            }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const half = x < rect.width / 2 ? i - 0.5 : i;
              onChange(half);
            }}
          >
            <svg width={28} height={28} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
              <rect width={32} height={32} fill={emptyColor} />
              {fillWidth > 0 ? (
                <rect width={fillWidth} height={32} fill={fillColor} />
              ) : null}
              <path d={STAR_PATH} fill="#fff" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

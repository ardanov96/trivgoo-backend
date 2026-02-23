const SPECIALIZATION_PUBLIC_PATH = {
  TOUR: "/products/tour",
  STAY: "/products/stay",
  TRANSPORT: "/products/transport",
};

function buildRelativeProductPath(specialization, filename) {
  const basePath = SPECIALIZATION_PUBLIC_PATH[specialization] || "/uploads/general";
  return `${basePath}/${filename}`;
}

module.exports = { buildRelativeProductPath };
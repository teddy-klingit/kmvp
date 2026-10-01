/** Context chips always read "On …" ("On Carousel · slide 3"), whoever wrote the label. */
export function onLabel(label: string) {
  return /^on\s/i.test(label) ? label : `On ${label}`;
}

// css-tree's subpath entries leave out the property/value grammar data that
// the full entry bundles. The reader only parses, walks and regenerates CSS.
declare module "css-tree/parser" {
  import { parse } from "css-tree";
  export default parse;
}
declare module "css-tree/walker" {
  import { walk } from "css-tree";
  export default walk;
}
declare module "css-tree/generator" {
  import { generate } from "css-tree";
  export default generate;
}

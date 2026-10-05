# smart-buy-cl

Herramienta personal para comparar productos de AliExpress antes de comprar, pensada para compradores en Chile.

## Qué hace

- Busca productos según lo que necesitas: características obligatorias, deseables y excluyentes.
- Calcula el **costo real puesto en Chile**: producto + envío + IVA.
- Evalúa al vendedor: % de feedback positivo, antigüedad de la tienda, ventas y si es tienda oficial o Choice.
- Agrupa el mismo producto revendido por distintas tiendas y muestra la mejor oferta de cada grupo.
- Entrega un ranking explicado de los mejores candidatos, con una tabla comparativa lado a lado.

## Cómo funciona

- Un script local en Python consulta la API oficial de afiliados de AliExpress (Open Platform) y sirve una página en `localhost`.
- Las credenciales se guardan solo en un archivo `.env` local y nunca se suben a este repositorio.
- Las compras se hacen con el link normal del producto, no con links de afiliado.

## Estado

En desarrollo.

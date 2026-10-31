import importlib.util
import pathlib
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('catalogo', pathlib.Path(__file__).parents[1] / 'api/catalogo.py')
cat = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cat)

HTML = '''<table id="testTable"><tr><th>NUMERO</th><th>IMAGEN</th><th>MARCA</th><th>CODIGO UNIVERSAL</th><th>GENERO</th><th>TALLAS</th><th>STOCK</th><th>P. VENTA</th></tr><tr><td>8</td><td>9</td></tr><tr><td>1</td><td><img src="imagen.jpg"></td><td>A</td><td>ABC-1</td><td>HOMBRE</td><td>1</td><td>2</td><td>3</td><td>199.90</td></tr><tr><td colspan="9">TOTAL</td></tr></table>'''

class CatalogoErpTest(unittest.TestCase):
    def test_tallas_precios_y_totales_no_se_desalinean(self):
        items = cat.parse_tabla_catalogo(HTML)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['cod_universal'], 'ABC-1')
        self.assertEqual(items[0]['tallas'], {'8': 1, '9': 2})
        self.assertEqual(items[0]['stock_total'], 3)
        self.assertEqual(items[0]['precio_venta'], 199.9)

    def test_sesion_vencida_no_se_interpreta_como_stock_vacio(self):
        with self.assertRaisesRegex(RuntimeError, 'tabla de stock'):
            cat.parse_tabla_catalogo('<form><input name="txt_clave"></form>')

    def test_fila_numerica_truncada_no_desaparece_silenciosamente(self):
        with self.assertRaisesRegex(RuntimeError, 'columnas incompletas'):
            cat.parse_tabla_catalogo(HTML.replace('<td>199.90</td>', ''))

    def test_encabezados_incompletos_y_tallas_duplicadas_fallan(self):
        for html in [HTML.replace('CODIGO UNIVERSAL', 'CODIGO CAMBIADO'), HTML.replace('<td>9</td>', '<td>8</td>'), '<table id="testTable"><tr></tr></table>']:
            with self.subTest(html=html), self.assertRaises(RuntimeError):
                cat.parse_tabla_catalogo(html)

    def test_cantidades_y_precios_no_finitos_o_corruptos_fallan(self):
        for html in [HTML.replace('<td>199.90</td>', '<td>NaN</td>'), HTML.replace('<td>3</td>', '<td>error</td>'), HTML.replace('<td>2</td>', '<td>?</td>')]:
            with self.subTest(html=html), self.assertRaises(RuntimeError):
                cat.parse_tabla_catalogo(html)

    def test_solo_el_mensaje_explicito_del_erp_permite_un_resultado_vacio(self):
        s = Mock()
        s.post.return_value.json.return_value = {'message': 'No se encontraron resultados'}
        self.assertEqual(cat.scrapear_catalogo(s, almacen='T01'), [])
        s.get.assert_not_called()
        s.post.return_value.json.return_value = {'message': 'Sesión vencida'}
        with self.assertRaises(RuntimeError):
            cat.scrapear_catalogo(s, almacen='T01')

    def test_filtros_no_divisibles_se_conservan_en_el_envio(self):
        with patch.object(cat, 'cargar_excel', return_value=HTML) as cargar:
            cat.scrapear_catalogo(Mock(), almacen='T01,T02', grupo='ZAPATILLAS', marca='NEWBALANCE', genero='HOMBRE', categoria='BASKETBALL', fecha_minima_ingreso='01/10/2026', stock_mayor_a='2')
        f = cargar.call_args.kwargs
        self.assertEqual(f['p_almacen'], 'T01,T02')
        self.assertEqual(f['p_stock_mayor_a'], '2')
        self.assertEqual(f['p_fecha_minima_ingreso'], '01/10/2026')
        self.assertEqual(f['p_categoria'], 'BASKETBALL')

    def test_opciones_oficiales_conservan_codigo_y_nombre_y_fallan_si_falta_una_dimension(self):
        html = ''.join(f'<select id="ctl02_dd_{d}"><option value="{v}">{n}</option></select>' for d, v, n in [('marca', 'NEWBALANCE', 'NEW BALANCE'), ('genero', 'NINOS', 'NIÑOS'), ('grupo', 'ZAPATILLAS', 'ZAPATILLAS'), ('categoria', 'BASKETBALL', 'BASQUET')])
        s = Mock(); s.post.return_value.text = html
        self.assertEqual(cat.opciones_catalogo(s)['categorias'], [{'valor': 'BASKETBALL', 'nombre': 'BASQUET'}])
        s.post.return_value.text = html.replace('ctl02_dd_categoria', 'otra')
        with self.assertRaises(RuntimeError):
            cat.opciones_catalogo(s)

if __name__ == '__main__':
    unittest.main()

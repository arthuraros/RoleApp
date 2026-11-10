
import { supabase } from './supabase.js';

export const cardapioService = {

    async criarCategoria({ idLocal, nome }) {
  if (!idLocal || !nome?.trim()) {
    throw new Error('Informe o estabelecimento e a categoria.');
  }

  const { data, error } = await supabase
    .from('categorias_cardapio')
    .insert({
      id_local: idLocal,
      nome: nome.trim(),
      ativo: true,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return data;
},

  // Listar categorias do estabelecimento
  async listarCategorias(idLocal) {
    const { data, error } = await supabase
      .from('categorias_cardapio')
      .select('*')
      .eq('id_local', idLocal)
      .order('ordem', { ascending: true });

    if (error) throw new Error(error.message);
    return data || [];
  },

  // Listar produtos do estabelecimento
  async listarItens(idLocal) {
    const { data, error } = await supabase
      .from('itens_cardapio')
      .select('*')
      .eq('id_local', idLocal)
      .order('ordem', { ascending: true });

    if (error) throw new Error(error.message);
    return data || [];
  },

  // Cadastrar produto
  async criarItem({ idLocal, idCategoria, nome, descricao, preco }) {
    const valor = Number(String(preco).replace(',', '.'));

    if (!idLocal || !nome?.trim()) {
      throw new Error('Informe o estabelecimento e o nome do produto.');
    }

    if (String(preco ?? '').trim() === '' ||
        !Number.isFinite(valor) || valor < 0) {
      throw new Error('Informe um preço válido.');
    }

    const { data, error } = await supabase
      .from('itens_cardapio')
      .insert({
        id_local: idLocal,
        id_categoria: idCategoria || null,
        nome: nome.trim(),
        descricao: descricao?.trim() || '',
        preco: valor,
        disponivel: true,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  },

  // Editar produto
  async atualizarItem(idItem, campos) {
    const permitidos = [
      'nome', 'descricao', 'preco',
      'id_categoria', 'disponivel', 'ordem'
    ];

    const atualizacao = Object.fromEntries(
      Object.entries(campos).filter(([chave]) =>
        permitidos.includes(chave)
      )
    );

    if (atualizacao.nome !== undefined) {
      atualizacao.nome = String(atualizacao.nome).trim();
      if (!atualizacao.nome) {
        throw new Error('O nome do produto é obrigatório.');
      }
    }

    if (atualizacao.preco !== undefined) {
      const valor = Number(String(atualizacao.preco).replace(',', '.'));
      if (String(atualizacao.preco ?? '').trim() === '' ||
          !Number.isFinite(valor) || valor < 0) {
        throw new Error('Informe um preço válido.');
      }
      atualizacao.preco = valor;
    }

    if (!Object.keys(atualizacao).length) {
      throw new Error('Nenhum campo válido para atualizar.');
    }

    const { data, error } = await supabase
      .from('itens_cardapio')
      .update(atualizacao)
      .eq('id_item', idItem)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  },

  // Excluir produto
  async excluirItem(idItem) {
    const { data, error } = await supabase
      .from('itens_cardapio')
      .delete()
      .eq('id_item', idItem)
      .select('id_item');

    if (error) throw new Error(error.message);

    if (!data?.length) {
      throw new Error('Produto não encontrado ou exclusão não permitida.');
    }

    return true;
  },
};

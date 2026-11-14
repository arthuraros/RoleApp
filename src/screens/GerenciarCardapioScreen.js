import { KeyboardViewport, KeyboardAwareScrollView } from '../components/KeyboardForm';
import { PAGE_CONTENT } from '../utils/responsive';

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { cardapioService } from '../services/cardapioService';

const ROXO = '#6820C9';
const ROXO_ESCURO = '#1D173F';
const FUNDO = '#F8F7FC';

// Habilitado para testes no Supabase de desenvolvimento.
// A segurança definitiva de parceiros ainda será revisada.
const ESCRITA_VALIDADA = true;

const dinheiro = valor => {
  const numero = Number(valor);

  return Number.isFinite(numero)
    ? numero.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      })
    : 'Preço indisponível';
};

function Botao({ titulo, icone, onPress, secundario, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={[
        styles.botao,
        secundario && styles.botaoSecundario,
        disabled && styles.botaoDesabilitado,
      ]}
    >
      {icone && (
        <Ionicons
          name={icone}
          size={19}
          color={secundario ? ROXO : '#FFFFFF'}
        />
      )}
      <Text
        style={[
          styles.botaoTexto,
          secundario && { color: ROXO },
        ]}
      >
        {titulo}
      </Text>
    </TouchableOpacity>
  );
}

function Campo({ titulo, valor, alterar, placeholder, teclado, multiline }) {
  return (
    <View style={styles.campoContainer}>
      <Text style={styles.campoTitulo}>{titulo}</Text>

      <TextInput
        value={valor}
        onChangeText={alterar}
        placeholder={placeholder}
        placeholderTextColor="#9A94A6"
        keyboardType={teclado || 'default'}
        multiline={!!multiline}
        maxLength={multiline ? 500 : 120}
        style={[
          styles.campo,
          multiline && styles.campoMultiline,
        ]}
      />
    </View>
  );
}

export function GerenciarCardapioScreen({ navigation, route }) {
  const local = route?.params?.local;
  const idLocal = local?.id_local;

  const [categorias, setCategorias] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // 'categoria', 'produto' ou null
  const [modal, setModal] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [produtoEditando, setProdutoEditando] = useState(null);
  const [produtoOcupado, setProdutoOcupado] = useState(null);

  const [nomeCategoria, setNomeCategoria] = useState('');
  const [nomeProduto, setNomeProduto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [preco, setPreco] = useState('');
  const [categoriaSelecionada, setCategoriaSelecionada] = useState(null);

  const carregar = useCallback(async () => {
    if (!idLocal) {
      setCategorias([]);
      setProdutos([]);
      setCarregando(false);
      return;
    }

    setCarregando(true);
    setErro('');

    try {
      const [cats, itens] = await Promise.all([
        cardapioService.listarCategorias(idLocal),
        cardapioService.listarItens(idLocal),
      ]);

      setCategorias(Array.isArray(cats) ? cats : []);
      setProdutos(Array.isArray(itens) ? itens : []);
    } catch (error) {
      setCategorias([]);
      setProdutos([]);
      setErro('Não foi possível carregar o cardápio.');
    } finally {
      setCarregando(false);
    }
  }, [idLocal]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function abrirCategoria() {
    if (!idLocal) return;
    setNomeCategoria('');
    setModal('categoria');
  }

  function abrirProduto() {
    if (!idLocal) return;
    setNomeProduto('');
    setDescricao('');
    setPreco('');
    setCategoriaSelecionada(null);
    setModal('produto');
  }

  function fecharModal() {
    if (!salvando) setModal(null);
  }

  async function salvarCategoria() {
    const nome = nomeCategoria.trim();

    if (!nome) {
      Alert.alert('Atenção', 'Informe o nome da categoria.');
      return;
    }

    if (!ESCRITA_VALIDADA) {
      Alert.alert(
        'Cadastro em preparação',
        'O formulário está pronto. O salvamento será habilitado após a validação das permissões do Supabase.'
      );
      return;
    }

    setSalvando(true);

    try {
      await cardapioService.criarCategoria({
        idLocal,
        nome,
      });

      setModal(null);
      await carregar();
      Alert.alert('Sucesso', 'Categoria cadastrada!');
    } catch (error) {
      Alert.alert(
        'Não foi possível cadastrar',
        error.message || 'Verifique os dados e tente novamente.'
      );
    } finally {
      setSalvando(false);
    }
  }

  async function salvarProduto() {
    const nome = nomeProduto.trim();
    const valor = Number(preco.trim().replace(',', '.'));

    if (!nome) {
      Alert.alert('Atenção', 'Informe o nome do produto.');
      return;
    }

    if (!preco.trim() || !Number.isFinite(valor) || valor < 0) {
      Alert.alert('Atenção', 'Informe um preço válido.');
      return;
    }

    if (!ESCRITA_VALIDADA) {
      Alert.alert(
        'Cadastro em preparação',
        'O formulário está pronto. O salvamento será habilitado após a validação das permissões do Supabase.'
      );
      return;
    }

    setSalvando(true);

    try {
      await cardapioService.criarItem({
        idLocal,
        idCategoria: categoriaSelecionada,
        nome,
        descricao: descricao.trim(),
        preco: valor,
      });

      setModal(null);
      await carregar();
      Alert.alert('Sucesso', 'Produto cadastrado!');
    } catch (error) {
      Alert.alert(
        'Não foi possível cadastrar',
        error.message || 'Verifique os dados e tente novamente.'
      );
    } finally {
      setSalvando(false);
    }
  }

  const disponiveis = produtos.filter(p => p.disponivel).length;

  // Inclui produtos sem categoria ou com categoria inexistente.
  const categoriasConhecidas = new Set(
    categorias.map(c => String(c.id_categoria))
  );

  const outros = produtos.filter(p =>
    p.id_categoria == null ||
    !categoriasConhecidas.has(String(p.id_categoria))
  );


function editarProduto(produto) {
  if (produtoOcupado !== null) return;

  setProdutoEditando(produto);
  setNomeProduto(produto.nome || '');
  setDescricao(produto.descricao || '');
  setPreco(String(produto.preco ?? '').replace('.', ','));
  setCategoriaSelecionada(produto.id_categoria ?? null);
  setModal('editar');
}

async function salvarEdicao() {
  if (!produtoEditando || salvando) return;

  const nome = nomeProduto.trim();
  const precoTexto = preco.trim();
  const valor = Number(precoTexto.replace(',', '.'));

  if (!nome) {
    Alert.alert('Atenção', 'Informe o nome do produto.');
    return;
  }

  if (
    !precoTexto ||
    !Number.isFinite(valor) ||
    valor < 0
  ) {
    Alert.alert('Atenção', 'Informe um preço válido.');
    return;
  }

  setSalvando(true);

  try {
    await cardapioService.atualizarItem(
      produtoEditando.id_item,
      {
        nome,
        descricao: descricao.trim(),
        preco: valor,
        id_categoria: categoriaSelecionada,
      }
    );

    setModal(null);
    setProdutoEditando(null);

    await carregar();

    Alert.alert(
      'Sucesso',
      'Produto atualizado com sucesso!'
    );
  } catch (error) {
    Alert.alert(
      'Erro ao editar',
      error.message || 'Não foi possível atualizar.'
    );
  } finally {
    setSalvando(false);
  }
}

async function alterarDisponibilidade(produto) {
  if (produtoOcupado !== null || salvando) return;

  setProdutoOcupado(produto.id_item);

  try {
    await cardapioService.atualizarItem(
      produto.id_item,
      {
        disponivel: !produto.disponivel,
      }
    );

    await carregar();
  } catch (error) {
    Alert.alert(
      'Erro',
      error.message ||
        'Não foi possível alterar a disponibilidade.'
    );
  } finally {
    setProdutoOcupado(null);
  }
}

function confirmarExclusao(produto) {
  if (produtoOcupado !== null || salvando) return;

  Alert.alert(
    'Excluir produto',
    `Deseja realmente excluir "${produto.nome}"? Essa ação não poderá ser desfeita.`,
    [
      {
        text: 'Cancelar',
        style: 'cancel',
      },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          setProdutoOcupado(produto.id_item);

          try {
            await cardapioService.excluirItem(
              produto.id_item
            );

            await carregar();

            Alert.alert(
              'Sucesso',
              'Produto excluído com sucesso!'
            );
          } catch (error) {
            Alert.alert(
              'Erro ao excluir',
              error.message ||
                'Não foi possível excluir o produto.'
            );
          } finally {
            setProdutoOcupado(null);
          }
        },
      },
    ]
  );
}

  function renderProduto(produto) {
    return (
      <View
        key={String(produto.id_item)}
        style={styles.produtoCard}
      >
        <View style={styles.produtoIcone}>
          <Ionicons
            name="restaurant-outline"
            size={24}
            color={ROXO}
          />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.produtoNome}>
            {produto.nome}
          </Text>

          {!!produto.descricao && (
            <Text style={styles.produtoDescricao}>
              {produto.descricao}
            </Text>
          )}

          <Text style={styles.produtoPreco}>
            {dinheiro(produto.preco)}
          </Text>

          <Text
            style={{
              color: produto.disponivel ? '#238248' : '#B44848',
              fontSize: 12,
              marginTop: 5,
              fontWeight: '700',
            }}
          >
            {produto.disponivel ? 'Disponível' : 'Indisponível'}
          </Text>


<View style={styles.acoesProduto}>
  <TouchableOpacity
    style={styles.acaoEditar}
    disabled={produtoOcupado !== null || salvando}
    onPress={() => editarProduto(produto)}
  >
    <Ionicons
      name="pencil-outline"
      size={16}
      color="#6820C9"
    />
    <Text style={styles.acaoEditarTexto}>
      Editar
    </Text>
  </TouchableOpacity>

  <TouchableOpacity
    style={styles.acaoDisponibilidade}
    disabled={produtoOcupado !== null || salvando}
    onPress={() => alterarDisponibilidade(produto)}
  >
    <Ionicons
      name={
        produto.disponivel
          ? 'eye-off-outline'
          : 'eye-outline'
      }
      size={16}
      color="#554078"
    />
    <Text style={styles.acaoDisponibilidadeTexto}>
      {produto.disponivel ? 'Pausar' : 'Ativar'}
    </Text>
  </TouchableOpacity>

  <TouchableOpacity
    style={styles.acaoExcluir}
    disabled={produtoOcupado !== null || salvando}
    onPress={() => confirmarExclusao(produto)}
  >
    <Ionicons
      name="trash-outline"
      size={16}
      color="#C53949"
    />
    <Text style={styles.acaoExcluirTexto}>
      Excluir
    </Text>
  </TouchableOpacity>
</View>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.tela}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.conteudo}
      >
        <View style={styles.cabecalho}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ alignSelf: 'flex-start' }}
          >
            <Ionicons
              name="arrow-back"
              size={26}
              color="#FFFFFF"
            />
          </TouchableOpacity>

          <Ionicons
            name="restaurant-outline"
            size={35}
            color="#FFFFFF"
            style={{ marginTop: 10 }}
          />

          <Text style={styles.titulo}>
            Meu Cardápio
          </Text>

          <Text style={styles.subtitulo}>
            {local?.nome || 'Selecione um estabelecimento'}
          </Text>
        </View>

        <View style={styles.corpo}>
          <View style={styles.resumo}>
            {[
              ['Categorias', categorias.length],
              ['Produtos', produtos.length],
              ['Disponíveis', disponiveis],
            ].map(([titulo, valor]) => (
              <View key={titulo} style={styles.resumoCard}>
                <Text style={styles.resumoValor}>{valor}</Text>
                <Text style={styles.resumoTitulo}>{titulo}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.secaoTitulo}>
            Gerenciar Cardápio
          </Text>

          <View style={styles.linhaBotoes}>
            <View style={{ flexGrow: 1, flexBasis: 150 }}>
              <Botao
                titulo="Novo produto"
                icone="add-circle-outline"
                onPress={abrirProduto}
                disabled={!idLocal}
              />
            </View>

            <View style={{ flexGrow: 1, flexBasis: 150 }}>
              <Botao
                titulo="Nova categoria"
                icone="folder-open-outline"
                onPress={abrirCategoria}
                disabled={!idLocal}
              />
            </View>
          </View>

          {!ESCRITA_VALIDADA && (
            <View style={styles.aviso}>
              <Ionicons
                name="information-circle-outline"
                size={20}
                color={ROXO}
              />
              <Text style={styles.avisoTexto}>
                Formulários disponíveis para teste.
                O salvamento no banco está temporariamente bloqueado.
              </Text>
            </View>
          )}

          <View style={styles.secaoLinha}>
            <Text style={styles.secaoTitulo}>
              Produtos cadastrados
            </Text>

            <TouchableOpacity
              onPress={carregar}
              accessibilityLabel="Atualizar cardápio"
            >
              <Ionicons
                name="refresh-outline"
                size={22}
                color={ROXO}
              />
            </TouchableOpacity>
          </View>

          {carregando ? (
            <ActivityIndicator
              size="large"
              color={ROXO}
              style={{ marginTop: 30 }}
            />
          ) : erro ? (
            <View style={styles.vazio}>
              <Text style={styles.erro}>{erro}</Text>
              <Botao
                titulo="Tentar novamente"
                onPress={carregar}
                secundario
              />
            </View>
          ) : !idLocal ? (
            <View style={styles.vazio}>
              <Text>Selecione um estabelecimento.</Text>
            </View>
          ) : produtos.length === 0 ? (
            <View style={styles.vazio}>
              <Ionicons
                name="fast-food-outline"
                size={36}
                color={ROXO}
              />
              <Text style={styles.vazioTitulo}>
                Nenhum produto cadastrado
              </Text>
              <Text style={styles.vazioTexto}>
                Utilize o botão Novo produto para preparar
                o primeiro item do cardápio.
              </Text>
            </View>
          ) : (
            <>
              {categorias.map(categoria => {
                const itens = produtos.filter(
                  p => String(p.id_categoria) ===
                    String(categoria.id_categoria)
                );

                if (!itens.length) return null;

                return (
                  <View key={String(categoria.id_categoria)}>
                    <Text style={styles.categoriaTitulo}>
                      {categoria.nome}
                    </Text>
                    {itens.map(renderProduto)}
                  </View>
                );
              })}

              {!!outros.length && (
                <View>
                  <Text style={styles.categoriaTitulo}>
                    Outros produtos
                  </Text>
                  {outros.map(renderProduto)}
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* FORMULÁRIOS */}
      <Modal
        visible={modal !== null}
        animationType="slide"
        transparent
        onRequestClose={fecharModal}
      >
        <KeyboardViewport style={styles.modalFundo}>
          <SafeAreaView style={styles.modalPainel}>
            <View style={styles.modalTopo}>
              <Text style={styles.modalTitulo}>
                {modal === 'categoria'
                 ? 'Nova categoria'
                 : modal === 'editar'
                 ? 'Editar produto'
                 : 'Novo produto'}
              </Text>

              <TouchableOpacity
                onPress={fecharModal}
                disabled={salvando}
              >
                <Ionicons
                  name="close"
                  size={27}
                  color={ROXO_ESCURO}
                />
              </TouchableOpacity>
            </View>

            <KeyboardAwareScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 15, paddingBottom: 20 }}
            >
              {modal === 'categoria' ? (
                <>
                  <Campo
                    titulo="Nome da categoria *"
                    valor={nomeCategoria}
                    alterar={setNomeCategoria}
                    placeholder="Ex.: Bebidas"
                  />
                  <Text style={styles.ajuda}>
                    Exemplos: Bebidas, Porções, Hambúrgueres e Sobremesas.
                  </Text>
                </>
              ) : (
                <>
                  <Campo
                    titulo="Nome do produto *"
                    valor={nomeProduto}
                    alterar={setNomeProduto}
                    placeholder="Ex.: Batata frita"
                  />

                  <Campo
                    titulo="Descrição"
                    valor={descricao}
                    alterar={setDescricao}
                    placeholder="Descreva o produto..."
                    multiline
                  />

                  <Campo
                    titulo="Preço (R$) *"
                    valor={preco}
                    alterar={setPreco}
                    placeholder="Ex.: 29,90"
                    teclado="decimal-pad"
                  />

                  <Text style={styles.campoTitulo}>
                    Categoria
                  </Text>

                  <View style={styles.categoriasEscolha}>
                    <TouchableOpacity
                      onPress={() => setCategoriaSelecionada(null)}
                      style={[
                        styles.categoriaOpcao,
                        categoriaSelecionada === null &&
                          styles.categoriaAtiva,
                      ]}
                    >
                      <Text style={styles.categoriaOpcaoTexto}>
                        Sem categoria
                      </Text>
                    </TouchableOpacity>

                    {categorias.map(categoria => {
                      const selecionada =
                        String(categoriaSelecionada) ===
                        String(categoria.id_categoria);

                      return (
                        <TouchableOpacity
                          key={String(categoria.id_categoria)}
                          onPress={() =>
                            setCategoriaSelecionada(categoria.id_categoria)
                          }
                          style={[
                            styles.categoriaOpcao,
                            selecionada && styles.categoriaAtiva,
                          ]}
                        >
                          <Text style={styles.categoriaOpcaoTexto}>
                            {categoria.nome}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              <Botao
                titulo={
                  salvando
                     ? 'Salvando...'
                     : modal === 'categoria'
                     ? 'Salvar categoria'
                     : modal === 'editar'
                     ? 'Salvar alterações'
                     : 'Salvar produto'
                }
                icone="checkmark-circle-outline"
                disabled={salvando}
                onPress={
                    modal === 'categoria'
                     ? salvarCategoria
                     : modal === 'editar'
                     ? salvarEdicao
                     : salvarProduto
}
              />

              {!ESCRITA_VALIDADA && (
                <Text style={styles.ajuda}>
                  Modo de preparação: os dados ainda não
                  serão enviados ao Supabase.
                </Text>
              )}

              <Botao
                titulo="Cancelar"
                secundario
                disabled={salvando}
                onPress={fecharModal}
              />
            </KeyboardAwareScrollView>
          </SafeAreaView>
        </KeyboardViewport>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tela: {
    flex: 1,
    backgroundColor: FUNDO,
  },
  conteudo: {
    ...PAGE_CONTENT,
    paddingBottom: 35,
  },
  cabecalho: {
    backgroundColor: '#4F159B',
    padding: 22,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    alignItems: 'center',
  },
  titulo: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: '800',
    marginTop: 9,
  },
  subtitulo: {
    color: '#EEE1FF',
    fontSize: 14,
    marginTop: 5,
  },
  corpo: {
    padding: 17,
  },
  resumo: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  resumoCard: {
    flex: 1,
    backgroundColor: '#EDE4FC',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 15,
  },
  resumoValor: {
    fontSize: 25,
    fontWeight: '900',
    color: ROXO,
  },
  resumoTitulo: {
    textAlign: 'center',
    fontSize: 11,
    color: ROXO_ESCURO,
    fontWeight: '700',
  },
  secaoTitulo: {
    flexShrink: 1,
    color: ROXO_ESCURO,
    fontSize: 19,
    fontWeight: '800',
  },
  linhaBotoes: {
    flexWrap: 'wrap',
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  botao: {
    backgroundColor: ROXO,
    borderRadius: 12,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  botaoSecundario: {
    backgroundColor: '#F3EDFE',
    borderWidth: 1,
    borderColor: ROXO,
  },
  botaoDesabilitado: {
    opacity: 0.5,
  },
  botaoTexto: {
    flexShrink: 1,
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
    textAlign: 'center',
  },
  aviso: {
    flexDirection: 'row',
    gap: 9,
    backgroundColor: '#EEE6FD',
    padding: 13,
    borderRadius: 12,
    marginTop: 15,
  },
  avisoTexto: {
    color: '#54417C',
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  secaoLinha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 27,
    marginBottom: 16,
  },
  categoriaTitulo: {
    fontSize: 17,
    fontWeight: '800',
    color: ROXO_ESCURO,
    marginBottom: 10,
    marginTop: 8,
  },
  produtoCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E9E2F0',
    borderRadius: 14,
    padding: 13,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 11,
  },
  produtoIcone: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#F1E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  produtoNome: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '800',
    color: ROXO_ESCURO,
  },
  produtoDescricao: {
    color: '#726B82',
    fontSize: 12,
    marginTop: 5,
  },
  produtoPreco: {
    color: ROXO,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 7,
  },
  vazio: {
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    gap: 10,
    alignItems: 'center',
  },
  vazioTitulo: {
    fontWeight: '800',
    fontSize: 16,
    color: ROXO_ESCURO,
  },
  vazioTexto: {
    color: '#706980',
    fontSize: 13,
    textAlign: 'center',
  },
  erro: {
    color: '#A02B46',
  },
  modalFundo: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20, 12, 40, 0.55)',
  },
  modalPainel: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    flexShrink: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 22,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    maxHeight: '85%',
  },
  modalTopo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  modalTitulo: {
    flex: 1,
    marginRight: 12,
    color: ROXO_ESCURO,
    fontSize: 22,
    fontWeight: '800',
  },
  campoContainer: {
    gap: 7,
  },
  campoTitulo: {
    fontSize: 13,
    fontWeight: '800',
    color: ROXO_ESCURO,
  },
  campo: {
    borderColor: '#DDD4E9',
    borderWidth: 1,
    borderRadius: 12,
    padding: 13,
    fontSize: 14,
    color: ROXO_ESCURO,
    backgroundColor: '#FCFAFF',
  },
  campoMultiline: {
    minHeight: 85,
    textAlignVertical: 'top',
  },
  ajuda: {
    fontSize: 12,
    color: '#777080',
    lineHeight: 18,
  },
  categoriasEscolha: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoriaOpcao: {
  minHeight: 44,
  maxWidth: '100%',
    borderWidth: 1,
    borderColor: '#DDD1F0',
    backgroundColor: '#F8F4FD',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
  },
  categoriaAtiva: {
    borderColor: ROXO,
    backgroundColor: '#E5D4FF',
  },
  categoriaOpcaoTexto: {
    color: ROXO_ESCURO,
    fontWeight: '700',
    fontSize: 12,
  },

 
acoesProduto: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 8,
  marginTop: 14,
},

acaoEditar: {
  minHeight: 44,
  maxWidth: '100%',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 5,
  paddingHorizontal: 10,
  paddingVertical: 9,
  borderRadius: 9,
  backgroundColor: '#F1E8FF',
},

acaoEditarTexto: {
  color: '#6820C9',
  fontSize: 12,
  fontWeight: '700',
},

acaoDisponibilidade: {
  minHeight: 44,
  maxWidth: '100%',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 5,
  paddingHorizontal: 10,
  paddingVertical: 9,
  borderRadius: 9,
  backgroundColor: '#F0EBF7',
},

acaoDisponibilidadeTexto: {
  color: '#554078',
  fontSize: 12,
  fontWeight: '700',
},

acaoExcluir: {
  minHeight: 44,
  maxWidth: '100%',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 5,
  paddingHorizontal: 10,
  paddingVertical: 9,
  borderRadius: 9,
  backgroundColor: '#FCECEE',
},

acaoExcluirTexto: {
  color: '#C53949',
  fontSize: 12,
  fontWeight: '700',
},
 
});

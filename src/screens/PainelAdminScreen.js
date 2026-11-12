
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { AccessGate } from '../components/AccessGate';
import { adminService } from '../services/adminService';

const ROXO = '#6820C9';
const ESCURO = '#1D173F';
const FUNDO = '#F8F7FC';

const ABAS = [
  { id: 'revisao', nome: 'Revisão', icone: 'clipboard-outline' },
  { id: 'pendentes', nome: 'Pendentes', icone: 'time-outline' },
  { id: 'historico', nome: 'Histórico', icone: 'archive-outline' },
];

function BotaoContato({ icone, titulo, valor, onPress }) {
  return (
    <TouchableOpacity
      style={styles.contato}
      disabled={!onPress}
      onPress={onPress}
    >
      <Ionicons name={icone} size={19} color={ROXO} />

      <View style={{ flex: 1 }}>
        <Text style={styles.contatoTitulo}>{titulo}</Text>
        <Text style={styles.contatoValor}>
          {valor || 'Não informado'}
        </Text>
      </View>

      {!!onPress && (
        <Ionicons name="open-outline" size={17} color={ROXO} />
      )}
    </TouchableOpacity>
  );
}

function AdminContent({ navigation }) {
  // Dados da tela
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [aba, setAba] = useState('revisao');
  const [selecionada, setSelecionada] = useState(null);

  // Carregamento
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');

  // Revisão comercial
  const [observacao, setObservacao] = useState('');
  const [encaminhando, setEncaminhando] = useState(false);

  // Decisão administrativa
  const [justificativa, setJustificativa] = useState('');
  const [idLocalDecisao, setIdLocalDecisao] = useState('');
  const [identidadeConfirmada, setIdentidadeConfirmada] = useState(false);
  const [duplicidadeRevisada, setDuplicidadeRevisada] = useState(false);
  const [decidindo, setDecidindo] = useState(false);
  const [detalhesDecisao, setDetalhesDecisao] = useState(null);
  const [carregandoDecisao, setCarregandoDecisao] = useState(false);
  const [erroDecisao, setErroDecisao] = useState('');

  // Carregar solicitações reais do Supabase
  const carregar = useCallback(async (refresh = false) => {
    if (refresh) {
      setAtualizando(true);
    } else {
      setCarregando(true);
    }

    setErro('');

    try {
      const dados = await adminService.listarSolicitacoes();

      setSolicitacoes(
        Array.isArray(dados) ? dados : []
      );
    } catch (error) {
      setErro(
        error?.message ||
        'Não foi possível carregar as solicitações.'
      );
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Contagem por aba
  const contagens = useMemo(() => {
    return {
      revisao: solicitacoes.filter(
        item => item.status === 'pendente'
      ).length,

      pendentes: solicitacoes.filter(
        item => item.status === 'em_analise'
      ).length,

      historico: solicitacoes.filter(
        item =>
          item.status === 'aprovado' ||
          item.status === 'rejeitado'
      ).length,
    };
  }, [solicitacoes]);

  // Filtrar os pedidos da aba selecionada
  const lista = useMemo(() => {
    return solicitacoes.filter(item => {
      if (aba === 'revisao') {
        return item.status === 'pendente';
      }

      if (aba === 'pendentes') {
        return item.status === 'em_analise';
      }

      return (
        item.status === 'aprovado' ||
        item.status === 'rejeitado'
      );
    });
  }, [solicitacoes, aba]);

  function statusTexto(status) {
    const nomes = {
      pendente: 'Aguardando revisão',
      em_analise: 'Pendente de decisão',
      aprovado: 'Aprovado',
      rejeitado: 'Reprovado',
    };

    return nomes[status] || status;
  }

  // Contatos
  async function abrirEmail(email) {
    if (!email) return;

    try {
      await Linking.openURL(
        `mailto:${encodeURIComponent(email)}`
      );
    } catch {
      Alert.alert(
        'Erro',
        'Não foi possível abrir o aplicativo de e-mail.'
      );
    }
  }

  async function abrirTelefone(telefone) {
    if (!telefone) return;

    const numero = String(telefone).replace(/[^\d+]/g, '');

    try {
      await Linking.openURL(`tel:${numero}`);
    } catch {
      Alert.alert(
        'Erro',
        'Não foi possível abrir o aplicativo de chamadas.'
      );
    }
  }

  // Abrir solicitação
 
async function abrirSolicitacao(item) {
  setSelecionada(item);

  setObservacao('');
  setJustificativa('');
  setIdLocalDecisao('');
  setIdentidadeConfirmada(false);
  setDuplicidadeRevisada(false);

  setDetalhesDecisao(null);
  setErroDecisao('');
  setCarregandoDecisao(false);

  // Buscar informações adicionais apenas no Histórico.
  if (!['aprovado', 'rejeitado'].includes(item.status)) {
    return;
  }

  setCarregandoDecisao(true);

  try {
    const dados = await adminService.obterDetalhesDecisao(
      item.id_solicitacao
    );

    setDetalhesDecisao(dados);
  } catch (error) {
    setErroDecisao(
      error?.message ||
        'Não foi possível consultar a decisão.'
    );
  } finally {
    setCarregandoDecisao(false);
  }
}

  function fecharDetalhes() {
    if (encaminhando || decidindo) return;

    setSelecionada(null);
    setObservacao('');
    setJustificativa('');
    setIdLocalDecisao('');
    setIdentidadeConfirmada(false);
    setDuplicidadeRevisada(false);
  }

  // Revisão -> Pendentes
  async function encaminharSolicitacao() {
    if (!selecionada || encaminhando || decidindo) return;

    const texto = observacao.trim();

    if (texto.length < 10 || texto.length > 2000) {
      Alert.alert(
        'Observação obrigatória',
        'Informe uma observação de 10 a 2000 caracteres.'
      );
      return;
    }

    if (!selecionada.id_usuario) {
      Alert.alert(
        'Solicitação incompleta',
        'Este pedido não possui usuário vinculado.'
      );
      return;
    }

    setEncaminhando(true);

    try {
      await adminService.encaminharParaDecisao(
        selecionada.id_solicitacao,
        texto
      );

      setSelecionada(null);
      setObservacao('');
      setAba('pendentes');

      await carregar(true);

      Alert.alert(
        'Solicitação encaminhada!',
        'O pedido foi movido para a aba Pendentes.'
      );
    } catch (error) {
      Alert.alert(
        'Erro ao encaminhar',
        error?.message || 'Não foi possível encaminhar.'
      );
    } finally {
      setEncaminhando(false);
    }
  }

  // Preparar aprovação ou reprovação
  function confirmarDecisao(decisao) {
    if (!selecionada || decidindo || encaminhando) return;

    if (selecionada.status !== 'em_analise') {
      Alert.alert(
        'Atenção',
        'Esta solicitação não está aguardando decisão.'
      );
      return;
    }

    if (!selecionada.id_usuario) {
      Alert.alert(
        'Solicitação incompleta',
        'O solicitante precisa ter uma conta vinculada.'
      );
      return;
    }

    const motivo = justificativa.trim();

    if (motivo.length < 10 || motivo.length > 2000) {
      Alert.alert(
        'Justificativa obrigatória',
        'Informe entre 10 e 2000 caracteres.'
      );
      return;
    }

    let idLocal = null;

    if (decisao === 'aprovado') {
      const textoId = idLocalDecisao.trim();
      idLocal = Number(textoId);

      if (
        !textoId ||
        !Number.isSafeInteger(idLocal) ||
        idLocal <= 0
      ) {
        Alert.alert(
          'Estabelecimento obrigatório',
          'Informe o ID válido do estabelecimento.'
        );
        return;
      }

      if (!identidadeConfirmada || !duplicidadeRevisada) {
        Alert.alert(
          'Verificações obrigatórias',
          'Confirme a identidade, a propriedade e as duplicidades.'
        );
        return;
      }
    }

    // Copiar os dados antes de abrir a confirmação.
    const dados = {
      idSolicitacao: selecionada.id_solicitacao,
      decisao,
      justificativa: motivo,
      idLocal,
      identidadeConfirmada:
        decisao === 'aprovado' && identidadeConfirmada,
      duplicidadeRevisada:
        decisao === 'aprovado' && duplicidadeRevisada,
    };

    Alert.alert(
      decisao === 'aprovado'
        ? 'Confirmar aprovação'
        : 'Confirmar reprovação',

      `Deseja ${
        decisao === 'aprovado' ? 'aprovar' : 'reprovar'
      } a solicitação #${selecionada.id_solicitacao}?`,

      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Confirmar',
          style:
            decisao === 'rejeitado'
              ? 'destructive'
              : 'default',
          onPress: () => executarDecisao(dados),
        },
      ]
    );
  }

  // Executar decisão no Supabase
  async function executarDecisao(dados) {
    if (decidindo || encaminhando) return;

    setDecidindo(true);

    try {
      await adminService.decidirParceria(dados);

      setSelecionada(null);
      setAba('historico');

      setJustificativa('');
      setIdLocalDecisao('');
      setIdentidadeConfirmada(false);
      setDuplicidadeRevisada(false);

      await carregar(true);

      Alert.alert(
        'Decisão registrada!',
        'A solicitação foi movida para o Histórico.'
      );
    } catch (error) {
      Alert.alert(
        'Não foi possível registrar a decisão',
        error?.message || 'Verifique os dados.'
      );

      await carregar(true);
    } finally {
      setDecidindo(false);
    }
  }

  // Card da listagem
  function renderCard(item) {
    return (
      <TouchableOpacity
        key={String(item.id_solicitacao)}
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => abrirSolicitacao(item)}
      >
        <View style={styles.cardTopo}>
          <View style={styles.iconeLocal}>
            <Ionicons
              name="storefront-outline"
              size={24}
              color={ROXO}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.nomeLocal}>
              {item.estabelecimento || 'Sem nome'}
            </Text>

            <Text style={styles.detalhe}>
              {item.cidade_estado || 'Cidade não informada'}
            </Text>
          </View>

          <Ionicons
            name="chevron-forward"
            size={21}
            color="#82778F"
          />
        </View>

        <View style={styles.divisor} />

        <Text style={styles.solicitante}>
          {item.nome || 'Solicitante não informado'}
        </Text>

        <View style={styles.cardRodape}>
          <Text style={styles.numero}>
            Solicitação #{item.id_solicitacao}
          </Text>

          <Text style={styles.status}>
            {statusTexto(item.status)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  // Detalhes de uma solicitação
  function renderDetalhes() {
    if (!selecionada) return null;

    const item = selecionada;

    return (
      <View style={styles.detalhes}>
        <TouchableOpacity
          style={styles.voltarDetalhes}
          onPress={fecharDetalhes}
          disabled={encaminhando || decidindo}
        >
          <Ionicons
            name="arrow-back"
            size={23}
            color={ESCURO}
          />

          <Text style={styles.voltarTexto}>
            Voltar às solicitações
          </Text>
        </TouchableOpacity>

        {/* Identificação da solicitação */}
        <View style={styles.card}>
          <Text style={styles.numero}>
            SOLICITAÇÃO #{item.id_solicitacao}
          </Text>

          <Text style={styles.detalhesTitulo}>
            {item.estabelecimento}
          </Text>

          <Text style={styles.detalhe}>
            {item.cidade_estado}
          </Text>

          <View style={styles.statusBox}>
            <Text style={styles.status}>
              {statusTexto(item.status)}
            </Text>
          </View>
        </View>

        {/* Dados do responsável */}
        <Text style={styles.secaoTitulo}>
          Dados do responsável
        </Text>

        <View style={styles.card}>
          <BotaoContato
            icone="person-outline"
            titulo="Responsável"
            valor={item.nome}
          />

          <BotaoContato
            icone="mail-outline"
            titulo="E-mail"
            valor={item.email}
            onPress={
              item.email
                ? () => abrirEmail(item.email)
                : undefined
            }
          />

          <BotaoContato
            icone="call-outline"
            titulo="Telefone / WhatsApp"
            valor={item.telefone}
            onPress={
              item.telefone
                ? () => abrirTelefone(item.telefone)
                : undefined
            }
          />
        </View>

        {/* Análise comercial */}
        <Text style={styles.secaoTitulo}>
          Análise comercial
        </Text>

        <View style={styles.card}>
          <View style={styles.avisoLinha}>
            <Ionicons
              name="information-circle-outline"
              size={22}
              color={ROXO}
            />

            <Text style={styles.avisoTexto}>
              Entre em contato para confirmar os dados,
              conhecer o negócio e conversar sobre os
              planos do RolêApp.
            </Text>
          </View>

          {/* ABA REVISÃO */}
          {item.status === 'pendente' ? (
            <View style={styles.formRevisao}>
              <Text style={styles.formTitulo}>
                Observações da revisão
              </Text>

              <Text style={styles.formDescricao}>
                Registre o contato comercial, o interesse
                na parceria e os próximos passos.
              </Text>

              <TextInput
                style={styles.observacaoInput}
                placeholder="Ex.: Conversei com o responsável, apresentei os planos e confirmei o interesse..."
                placeholderTextColor="#9990A6"
                multiline
                textAlignVertical="top"
                maxLength={2000}
                value={observacao}
                onChangeText={setObservacao}
                editable={!encaminhando}
              />

              {!item.id_usuario && (
                <Text style={styles.alerta}>
                  Esta solicitação não possui usuário
                  vinculado. Verifique o cadastro antes
                  de encaminhar.
                </Text>
              )}

              <TouchableOpacity
                style={[
                  styles.botaoEncaminhar,
                  (encaminhando || !item.id_usuario) &&
                    styles.desabilitado,
                ]}
                disabled={
                  encaminhando || !item.id_usuario
                }
                onPress={encaminharSolicitacao}
              >
                {encaminhando ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons
                      name="arrow-forward-circle-outline"
                      size={22}
                      color="#FFFFFF"
                    />

                    <Text style={styles.botaoDecisaoTexto}>
                      Encaminhar para decisão
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

          ) : item.status === 'em_analise' ? (

            /* ABA PENDENTES */
            <View style={styles.formRevisao}>
              <Text style={styles.formTitulo}>
                Decisão administrativa
              </Text>

              <Text style={styles.formDescricao}>
                Registre o motivo da decisão.
                Para aprovar, confirme a identidade
                e o estabelecimento do solicitante.
              </Text>

              <Text style={styles.campoLabel}>
                Justificativa da decisão *
              </Text>

              <TextInput
                style={styles.observacaoInput}
                placeholder="Informe o resultado da análise comercial..."
                placeholderTextColor="#9990A6"
                multiline
                textAlignVertical="top"
                maxLength={2000}
                value={justificativa}
                onChangeText={setJustificativa}
                editable={!decidindo}
              />

              <Text style={styles.campoLabel}>
                ID do estabelecimento confirmado
              </Text>

              <TextInput
                style={styles.campoDecisao}
                placeholder="Ex.: 8"
                placeholderTextColor="#9990A6"
                keyboardType="number-pad"
                value={idLocalDecisao}
                onChangeText={setIdLocalDecisao}
                editable={!decidindo}
              />

              <Text style={styles.formDescricao}>
                Para aprovar, informe o ID de um
                estabelecimento já cadastrado e
                pertencente ao solicitante.
              </Text>

              <TouchableOpacity
                style={styles.confirmacaoLinha}
                disabled={decidindo}
                onPress={() =>
                  setIdentidadeConfirmada(valor => !valor)
                }
              >
                <Ionicons
                  name={
                    identidadeConfirmada
                      ? 'checkbox'
                      : 'square-outline'
                  }
                  size={24}
                  color={ROXO}
                />

                <Text style={styles.confirmacaoTexto}>
                  Confirmei a identidade e a
                  propriedade do estabelecimento.
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmacaoLinha}
                disabled={decidindo}
                onPress={() =>
                  setDuplicidadeRevisada(valor => !valor)
                }
              >
                <Ionicons
                  name={
                    duplicidadeRevisada
                      ? 'checkbox'
                      : 'square-outline'
                  }
                  size={24}
                  color={ROXO}
                />

                <Text style={styles.confirmacaoTexto}>
                  Verifiquei possíveis solicitações
                  duplicadas e conflitos.
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.botaoAprovar,
                  decidindo && styles.desabilitado,
                ]}
                disabled={decidindo}
                onPress={() =>
                  confirmarDecisao('aprovado')
                }
              >
                {decidindo ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={22}
                      color="#FFFFFF"
                    />
                    <Text style={styles.botaoDecisaoTexto}>
                      Aprovar parceria
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.botaoReprovar,
                  decidindo && styles.desabilitado,
                ]}
                disabled={decidindo}
                onPress={() =>
                  confirmarDecisao('rejeitado')
                }
              >
                <Ionicons
                  name="close-circle-outline"
                  size={22}
                  color="#FFFFFF"
                />

                <Text style={styles.botaoDecisaoTexto}>
                  Reprovar parceria
                </Text>
              </TouchableOpacity>
            </View>
          ) : (

            /* ABA HISTÓRICO */
            
<View style={styles.historicoContainer}>
  <View style={styles.historicoInfo}>
    <Ionicons
      name={
        item.status === 'aprovado'
          ? 'checkmark-circle-outline'
          : 'close-circle-outline'
      }
      size={26}
      color={
        item.status === 'aprovado'
          ? '#26804D'
          : '#C0394B'
      }
    />

    <Text style={styles.historicoTitulo}>
      {item.status === 'aprovado'
        ? 'Parceria aprovada'
        : 'Solicitação reprovada'}
    </Text>
  </View>

  {carregandoDecisao ? (
    <ActivityIndicator
      color={ROXO}
      style={{ marginVertical: 20 }}
    />
  ) : erroDecisao ? (
    <Text style={styles.alerta}>
      {erroDecisao}
    </Text>
  ) : detalhesDecisao ? (
    <>
      <View style={styles.divisor} />

      <Text style={styles.campoLabel}>
        Justificativa registrada
      </Text>

      <Text style={styles.historicoValor}>
        {detalhesDecisao.justificativa ||
          'Sem justificativa registrada.'}
      </Text>

      <Text style={styles.campoLabel}>
        Data da decisão
      </Text>

      <Text style={styles.historicoValor}>
        {detalhesDecisao.data_decisao
          ? new Date(
              detalhesDecisao.data_decisao
            ).toLocaleString('pt-BR', {
              timeZone: 'America/Sao_Paulo',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : 'Data não disponível'}
      </Text>

      <Text style={styles.campoLabel}>
        Administrador responsável
      </Text>

      <Text style={styles.historicoValor}>
        {detalhesDecisao.administrador_email ||
          detalhesDecisao.id_admin ||
          'Não identificado'}
      </Text>

      {detalhesDecisao.id_local != null && (
        <>
          <Text style={styles.campoLabel}>
            Estabelecimento vinculado
          </Text>

          <Text style={styles.historicoValor}>
            ID {detalhesDecisao.id_local}
          </Text>
        </>
      )}
    </>
  ) : (
    <Text style={styles.formDescricao}>
      Não foi encontrado um registro de decisão
      para esta solicitação.
    </Text>
  )}
</View>
          )}
        </View>
      </View>
    );
  }

  // Tela principal
  return (
    <SafeAreaView style={styles.tela}>
      <ScrollView
        contentContainerStyle={styles.conteudo}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            onRefresh={() => carregar(true)}
            tintColor={ROXO}
            colors={[ROXO]}
          />
        }
      >
        <View style={styles.cabecalho}>
          <TouchableOpacity
            style={styles.voltar}
            onPress={() => navigation.goBack()}
          >
            <Ionicons
              name="arrow-back"
              size={25}
              color="#FFFFFF"
            />
          </TouchableOpacity>

          <Ionicons
            name="shield-checkmark-outline"
            size={36}
            color="#FFFFFF"
          />

          <Text style={styles.titulo}>
            Painel Administrativo
          </Text>

          <Text style={styles.subtitulo}>
            Gerenciamento de parcerias
          </Text>
        </View>

        <View style={styles.corpo}>
          {selecionada ? (
            renderDetalhes()
          ) : (
            <>
              {/* Resumo */}
              <View style={styles.resumo}>
                {[
                  {
                    nome: 'Revisão',
                    valor: contagens.revisao,
                  },
                  {
                    nome: 'Pendentes',
                    valor: contagens.pendentes,
                  },
                  {
                    nome: 'Histórico',
                    valor: contagens.historico,
                  },
                ].map(item => (
                  <View
                    key={item.nome}
                    style={styles.resumoCard}
                  >
                    <Text style={styles.resumoNumero}>
                      {item.valor}
                    </Text>

                    <Text style={styles.resumoTexto}>
                      {item.nome}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Navegação por etapas */}
              <View style={styles.abas}>
                {ABAS.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.aba,
                      aba === item.id && styles.abaAtiva,
                    ]}
                    onPress={() => setAba(item.id)}
                  >
                    <Ionicons
                      name={item.icone}
                      size={17}
                      color={
                        aba === item.id
                          ? '#FFFFFF'
                          : ROXO
                      }
                    />

                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      style={[
                        styles.abaTexto,
                        aba === item.id &&
                          styles.abaTextoAtiva,
                      ]}
                    >
                      {item.nome}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.linhaTitulo}>
                <Text style={styles.secaoTitulo}>
                  {aba === 'revisao'
                    ? 'Aguardando revisão'
                    : aba === 'pendentes'
                    ? 'Aguardando decisão'
                    : 'Histórico de solicitações'}
                </Text>

                <TouchableOpacity
                  onPress={() => carregar()}
                >
                  <Ionicons
                    name="refresh-outline"
                    size={24}
                    color={ROXO}
                  />
                </TouchableOpacity>
              </View>

              {/* Listagem */}
              {carregando ? (
                <ActivityIndicator
                  size="large"
                  color={ROXO}
                  style={{ marginTop: 35 }}
                />
              ) : erro ? (
                <View style={styles.vazio}>
                  <Text style={styles.erro}>
                    {erro}
                  </Text>

                  <TouchableOpacity
                    onPress={() => carregar()}
                  >
                    <Text style={styles.link}>
                      Tentar novamente
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : lista.length === 0 ? (
                <View style={styles.vazio}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={40}
                    color={ROXO}
                  />

                  <Text style={styles.vazioTexto}>
                    Nenhuma solicitação nesta etapa.
                  </Text>
                </View>
              ) : (
                lista.map(renderCard)
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Somente administradores podem abrir a tela.
export function PainelAdminScreen(props) {
  return (
    <AccessGate role="admin">
      <AdminContent {...props} />
    </AccessGate>
  );
}

const styles = StyleSheet.create({
  tela: {
    flex: 1,
    backgroundColor: FUNDO,
  },

  conteudo: {
    paddingBottom: 35,
  },

  cabecalho: {
    backgroundColor: '#4F159B',
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    padding: 22,
    alignItems: 'center',
  },

  voltar: {
    alignSelf: 'flex-start',
    marginBottom: 12,
  },

  titulo: {
    fontSize: 25,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 10,
    textAlign: 'center',
  },

  subtitulo: {
    color: '#E9DAFF',
    marginTop: 5,
  },

  corpo: {
    padding: 16,
  },

  resumo: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },

  resumoCard: {
    flex: 1,
    backgroundColor: '#EDE4FC',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 15,
  },

  resumoNumero: {
    fontSize: 25,
    fontWeight: '900',
    color: ROXO,
  },

  resumoTexto: {
    fontSize: 11,
    fontWeight: '700',
    color: ESCURO,
  },

  abas: {
    flexDirection: 'row',
    gap: 5,
    marginBottom: 22,
  },

  aba: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#EEE7F8',
  },

  abaAtiva: {
    backgroundColor: ROXO,
  },

  abaTexto: {
    fontSize: 11,
    fontWeight: '700',
    color: ROXO,
    textAlign: 'center',
  },

  abaTextoAtiva: {
    color: '#FFFFFF',
  },

  linhaTitulo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15,
  },

  secaoTitulo: {
    fontSize: 19,
    fontWeight: '800',
    color: ESCURO,
    marginBottom: 12,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8E1F2',
  },

  cardTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },

  iconeLocal: {
    width: 49,
    height: 49,
    borderRadius: 12,
    backgroundColor: '#F1E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  nomeLocal: {
    fontSize: 16,
    fontWeight: '800',
    color: ESCURO,
  },

  detalhe: {
    fontSize: 13,
    color: '#777087',
    marginTop: 4,
  },

  divisor: {
    height: 1,
    backgroundColor: '#EFEAF4',
    marginVertical: 13,
  },

  solicitante: {
    color: '#504860',
    fontSize: 13,
  },

  cardRodape: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 13,
  },

  numero: {
    fontSize: 12,
    color: '#786E89',
    fontWeight: '700',
  },

  status: {
    color: ROXO,
    fontSize: 12,
    fontWeight: '800',
  },

  voltarDetalhes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 18,
  },

  voltarTexto: {
    color: ESCURO,
    fontWeight: '700',
  },

  detalhes: {
    gap: 8,
  },

  detalhesTitulo: {
    fontSize: 23,
    fontWeight: '800',
    color: ESCURO,
    marginTop: 12,
  },

  statusBox: {
    backgroundColor: '#EDE4FC',
    padding: 12,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 14,
  },

  contato: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },

  contatoTitulo: {
    color: '#81798E',
    fontSize: 12,
    marginBottom: 3,
  },

  contatoValor: {
    color: ESCURO,
    fontSize: 14,
    fontWeight: '700',
  },

  avisoLinha: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },

  avisoTexto: {
    flex: 1,
    color: '#59506A',
    fontSize: 13,
    lineHeight: 19,
  },

  formRevisao: {
    gap: 12,
    marginTop: 15,
  },

  formTitulo: {
    color: ESCURO,
    fontSize: 16,
    fontWeight: '800',
  },

  formDescricao: {
    color: '#706780',
    fontSize: 13,
    lineHeight: 19,
  },

  campoLabel: {
    color: ESCURO,
    fontSize: 13,
    fontWeight: '700',
  },

  observacaoInput: {
    backgroundColor: '#FCFAFF',
    borderWidth: 1,
    borderColor: '#D9CCE9',
    borderRadius: 12,
    minHeight: 125,
    padding: 13,
    fontSize: 14,
    color: ESCURO,
    textAlignVertical: 'top',
  },

  campoDecisao: {
    backgroundColor: '#FCFAFF',
    borderWidth: 1,
    borderColor: '#D9CCE9',
    borderRadius: 12,
    padding: 13,
    fontSize: 15,
    color: ESCURO,
  },

  confirmacaoLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F4EFFA',
    padding: 13,
    borderRadius: 12,
  },

  confirmacaoTexto: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: '#45395B',
  },

  botaoEncaminhar: {
    backgroundColor: ROXO,
    padding: 15,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },

  botaoAprovar: {
    backgroundColor: '#26804D',
    padding: 15,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },

  botaoReprovar: {
    backgroundColor: '#C0394B',
    padding: 15,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },

  botaoDecisaoTexto: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  desabilitado: {
    opacity: 0.5,
  },

  alerta: {
    color: '#B45309',
    fontSize: 12,
    lineHeight: 18,
  },

  historicoInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 16,
  },

  vazio: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 26,
    alignItems: 'center',
    gap: 12,
  },

  vazioTexto: {
    color: '#777087',
    textAlign: 'center',
  },

  erro: {
    color: '#B83E4E',
    textAlign: 'center',
  },

  link: {
    color: ROXO,
    fontWeight: '800',
  },


historicoContainer: {
  marginTop: 16,
  gap: 11,
  backgroundColor: '#F8F5FD',
  borderRadius: 12,
  padding: 15,
},

historicoTitulo: {
  fontSize: 16,
  fontWeight: '800',
  color: '#1D173F',
  flex: 1,
},

historicoValor: {
  fontSize: 14,
  lineHeight: 21,
  color: '#514760',
  backgroundColor: '#FFFFFF',
  padding: 12,
  borderRadius: 9,
},


});
